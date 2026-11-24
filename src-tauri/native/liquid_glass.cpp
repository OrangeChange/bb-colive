#define WIN32_LEAN_AND_MEAN
#define NOMINMAX
#include <windows.h>
#include <commctrl.h>
#include <d3d11.h>
#include <d3dcompiler.h>
#include <dxgi1_3.h>
#include <dcomp.h>
#include <wrl/client.h>
#include <chrono>
#include <stdexcept>
#include <string>
#include <vector>
#include <algorithm>
#include <cstdio>
#include <atomic>
#include <thread>
#include <array>
#include <memory>
#include <mutex>
#include <map>
#include "glass_shaders.h"
using Microsoft::WRL::ComPtr;
using Clock = std::chrono::steady_clock;
struct Surface {
    HWND hwnd;
    std::atomic<bool> running{true}, dark{false}, moving{false};
    std::atomic<float> radius{12}, tint{0.18f}, colorR{0}, colorG{0}, colorB{0}, colorA{-1};
    std::atomic<unsigned> revision{0};
    HANDLE wake = CreateEventW(nullptr, FALSE, FALSE, nullptr);
    HANDLE ready = CreateEventW(nullptr, TRUE, FALSE, nullptr);
    std::thread thread;
    std::string error;
    ~Surface() { running=false; SetEvent(wake); if(thread.joinable()) thread.join(); CloseHandle(wake); CloseHandle(ready); }
};
static thread_local Surface* current;
#define windowHandle (current->hwnd)
#define running (current->running)
#define darkMode (current->dark)
#define moving (current->moving)
#define renderWake (current->wake)
static std::atomic<float> lensStrength{1};
static void check(HRESULT hr, const char* operation) {
    if(FAILED(hr)) { char text[256]; sprintf_s(text,"%s: 0x%08X",operation,unsigned(hr)); throw std::runtime_error(text); }
}
struct Settings {
    float width,height,desktopWidth,desktopHeight,x,y,radius,rim,dark,lens,luminance,contrast;
    float tint,colorR,colorG,colorB,colorA,pad0,pad1,pad2;
};

struct DesktopCapture {
    std::mutex mutex;
    ComPtr<ID3D11Device> device;
    ComPtr<ID3D11DeviceContext> context;
    ComPtr<IDXGIFactory1> factory;
    ComPtr<IDXGIOutput1> captureOutput;
    ComPtr<IDXGIOutputDuplication> duplication;
    ComPtr<ID3D11Texture2D> desktop;
    ComPtr<ID3D11ShaderResourceView> desktopView;
    DXGI_OUTPUT_DESC output{};
    std::vector<BYTE> metadata;
    bool hasDesktop=false, failed=false;
    unsigned active=0, pointerFrames=0, fullCopies=0, regionCopies=0;
    unsigned long long copiedPixels=0, version=0;
    bool copyDesktop(ID3D11Texture2D* source, const DXGI_OUTDUPL_FRAME_INFO& information, const RECT& panel) {
        D3D11_TEXTURE2D_DESC desc{}; desktop->GetDesc(&desc);
        if (!hasDesktop || (information.LastPresentTime.QuadPart && !information.TotalMetadataBufferSize)) {
            context->CopyResource(desktop.Get(), source); ++fullCopies;
            copiedPixels += static_cast<unsigned long long>(desc.Width) * desc.Height;
            return true;
        }
        if (!information.LastPresentTime.QuadPart) { ++pointerFrames; return false; }
        metadata.resize(information.TotalMetadataBufferSize);

        bool affected = false;
        auto copy = [&](const RECT& rect) {
            D3D11_BOX box{UINT(rect.left), UINT(rect.top), 0, UINT(rect.right), UINT(rect.bottom), 1};
            context->CopySubresourceRegion(desktop.Get(), 0, rect.left, rect.top, 0, source, 0, &box);
            ++regionCopies; copiedPixels += static_cast<unsigned long long>(rect.right - rect.left) * (rect.bottom - rect.top);
            affected = true;
        };
        UINT bytes = 0;
        check(duplication->GetFrameMoveRects(UINT(metadata.size()), reinterpret_cast<DXGI_OUTDUPL_MOVE_RECT*>(metadata.data()), &bytes), "Desktop move rectangles");
        auto moves = reinterpret_cast<DXGI_OUTDUPL_MOVE_RECT*>(metadata.data());
        for (UINT i = 0; i < bytes / sizeof(DXGI_OUTDUPL_MOVE_RECT); ++i) copy(moves[i].DestinationRect);
        check(duplication->GetFrameDirtyRects(UINT(metadata.size()), reinterpret_cast<RECT*>(metadata.data()), &bytes), "Desktop dirty rectangles");
        auto dirty = reinterpret_cast<RECT*>(metadata.data());
        for (UINT i = 0; i < bytes / sizeof(RECT); ++i) copy(dirty[i]);
        return affected;
    }


    DesktopCapture(HMONITOR monitor) {
        check(CreateDXGIFactory1(IID_PPV_ARGS(&factory)), "CreateDXGIFactory1");
        ComPtr<IDXGIAdapter1> adapter;
        ComPtr<IDXGIOutput> selected;
        for(UINT a=0; !selected; ++a) {
            ComPtr<IDXGIAdapter1> candidate;
            if(factory->EnumAdapters1(a,&candidate)==DXGI_ERROR_NOT_FOUND) break;
            for(UINT o=0;;++o) {
                ComPtr<IDXGIOutput> possible;
                if(candidate->EnumOutputs(o,&possible)==DXGI_ERROR_NOT_FOUND) break;
                DXGI_OUTPUT_DESC desc{}; possible->GetDesc(&desc);
                if(desc.Monitor==monitor) {adapter=candidate;selected=possible;output=desc;break;}
            }
        }
        if(!selected) throw std::runtime_error("No desktop output for window");
        check(D3D11CreateDevice(adapter.Get(),D3D_DRIVER_TYPE_UNKNOWN,nullptr,D3D11_CREATE_DEVICE_BGRA_SUPPORT,
            nullptr,0,D3D11_SDK_VERSION,&device,nullptr,&context),"D3D11CreateDevice");
        check(selected.As(&captureOutput),"IDXGIOutput1");
        check(captureOutput->DuplicateOutput(device.Get(),&duplication),"DuplicateOutput");
        DXGI_OUTDUPL_DESC desc{}; duplication->GetDesc(&desc);
        D3D11_TEXTURE2D_DESC texture{};
        texture.Width=desc.ModeDesc.Width;texture.Height=desc.ModeDesc.Height;
        texture.MipLevels=texture.ArraySize=1;texture.Format=DXGI_FORMAT_B8G8R8A8_UNORM;
        texture.SampleDesc.Count=1;texture.Usage=D3D11_USAGE_DEFAULT;texture.BindFlags=D3D11_BIND_SHADER_RESOURCE;
        check(device->CreateTexture2D(&texture,nullptr,&desktop),"Desktop texture");
        check(device->CreateShaderResourceView(desktop.Get(),nullptr,&desktopView),"Desktop view");
    }
    void acquire() {
        if(!duplication) {
            check(captureOutput->DuplicateOutput(device.Get(),&duplication),"Resume desktop capture");
            DXGI_OUTDUPL_DESC resumed{}; duplication->GetDesc(&resumed);
            D3D11_TEXTURE2D_DESC cached{}; desktop->GetDesc(&cached);
            DXGI_OUTPUT_DESC currentOutput{}; check(captureOutput->GetDesc(&currentOutput), "Desktop output geometry");
            if(resumed.ModeDesc.Width!=cached.Width || resumed.ModeDesc.Height!=cached.Height
                || currentOutput.Rotation!=output.Rotation || !EqualRect(&currentOutput.DesktopCoordinates,&output.DesktopCoordinates)) {
                failed=true; throw std::runtime_error("Desktop geometry changed");
            }
            hasDesktop=false;
        }
        DXGI_OUTDUPL_FRAME_INFO information{};
        ComPtr<IDXGIResource> resource;
        HRESULT result=duplication->AcquireNextFrame(0,&information,&resource);
        if(result==DXGI_ERROR_WAIT_TIMEOUT) return;
        if(FAILED(result)) {failed=true; check(result,"Acquire desktop frame");}
        try {
            ComPtr<ID3D11Texture2D> frame;check(resource.As(&frame),"Desktop frame");
            ID3D11ShaderResourceView* empty=nullptr;context->PSSetShaderResources(0,1,&empty);
            context->CSSetShaderResources(0,1,&empty);
            RECT unused{};
            if(copyDesktop(frame.Get(),information,unused)) ++version;
            hasDesktop=true;
        } catch(...) {duplication->ReleaseFrame();throw;}
        check(duplication->ReleaseFrame(),"Release desktop frame");
    }
};
static std::shared_ptr<DesktopCapture> desktopFor(HMONITOR monitor) {
    static std::mutex mutex;
    static std::map<HMONITOR,std::weak_ptr<DesktopCapture>> desktops;
    std::lock_guard<std::mutex> lock(mutex);
    auto desktop=desktops[monitor].lock();
    bool failed=false;
    if(desktop) {std::lock_guard<std::mutex> guard(desktop->mutex);failed=desktop->failed;}
    if(failed) desktop.reset();
    if(!desktop) {desktop=std::make_shared<DesktopCapture>(monitor);desktops[monitor]=desktop;}
    return desktop;
}
class Renderer {
    std::shared_ptr<DesktopCapture> capture;
    bool captureActive=false;
    unsigned long long seenVersion=0;
    ComPtr<ID3D11Device> device;
    ComPtr<ID3D11DeviceContext> context;
    ComPtr<ID3D11Texture2D> desktop;
    ComPtr<ID3D11ShaderResourceView> desktopView;
    ComPtr<ID3D11Texture2D> samples;
    ComPtr<ID3D11Query> sampleReady;
    ComPtr<ID3D11ComputeShader> activityShader;
    ComPtr<ID3D11Texture2D> presentedPatch;
    ComPtr<ID3D11ShaderResourceView> presentedPatchView;
    ComPtr<ID3D11Buffer> activityRegion, activityResult, activityReadback;
    ComPtr<ID3D11UnorderedAccessView> activityResultView;
    ComPtr<ID3D11Query> activityReady;
    RECT referenceRegion{};
    bool referenceValid = false, activityPending = false, idle = false;
    unsigned long long backgroundVersion = 0, probedVersion = 0;
    std::chrono::steady_clock::time_point lastRealChange = std::chrono::steady_clock::now();
    bool samplePending = false;
    ComPtr<IDXGISwapChain1> swapChain;
    HANDLE frameReady = nullptr;
    bool frameAvailable = false;
    ComPtr<ID3D11RenderTargetView> target;
    ComPtr<ID3D11VertexShader> vertexShader;
    ComPtr<ID3D11PixelShader> pixelShader;
    ComPtr<ID3D11Buffer> constants;
    ComPtr<ID3D11SamplerState> sampler;
    ComPtr<IDCompositionDevice> composition;
    ComPtr<IDCompositionTarget> compositionTarget;
    ComPtr<IDCompositionVisual> visual;
    DXGI_OUTPUT_DESC output{};
    UINT width = 480, height = 480;
    bool hasDesktop = false;
    float backdropLuminance = 0.5f, backdropContrast = 0.0f;
    bool adaptiveLightInk = false;
    std::chrono::steady_clock::time_point lastSample{};
    RECT lastPosition{};
    bool firstDraw = true, lastDark = false;
    float lastLens = -1;
    unsigned lastRevision = 0;

    void createTargets() {
        ComPtr<ID3D11Texture2D> backBuffer;
        check(swapChain->GetBuffer(0, IID_PPV_ARGS(&backBuffer)), "GetBuffer");
        check(device->CreateRenderTargetView(backBuffer.Get(), nullptr, &target), "CreateRenderTargetView");
    }

    bool readSamples() {
        if (!samplePending) return false;
        const HRESULT ready = context->GetData(sampleReady.Get(), nullptr, 0, D3D11_ASYNC_GETDATA_DONOTFLUSH);
        if (ready == S_FALSE) return false;
        check(ready, "Background sample completion");
        D3D11_MAPPED_SUBRESOURCE pixels{};
        HRESULT mapped = context->Map(samples.Get(), 0, D3D11_MAP_READ, D3D11_MAP_FLAG_DO_NOT_WAIT, &pixels);
        if (mapped == DXGI_ERROR_WAS_STILL_DRAWING) return false;
        check(mapped, "Read completed background sample");
        std::array<float, 15> brightness{};
        for (UINT y = 0; y < 3; ++y) for (UINT x = 0; x < 5; ++x) {
            auto pixel = static_cast<BYTE*>(pixels.pData) + y * pixels.RowPitch + x * 4;
            brightness[y * 5 + x] = (pixel[2] * 0.299f + pixel[1] * 0.587f + pixel[0] * 0.114f) / 255;
        }
        context->Unmap(samples.Get(), 0); samplePending = false;
        std::sort(brightness.begin(), brightness.end());
        float sum = 0; for (size_t i = 2; i < brightness.size() - 2; ++i) sum += brightness[i];
        const float luminance = sum / (brightness.size() - 4), contrast = brightness[12] - brightness[2];
        bool lightInk = adaptiveLightInk;
        if (luminance < 0.45f) lightInk = true;
        else if (luminance > 0.55f) lightInk = false;
        const bool changed = std::abs(luminance - backdropLuminance) > 0.005f || std::abs(contrast - backdropContrast) > 0.005f || lightInk != adaptiveLightInk;
        backdropLuminance = luminance; backdropContrast = contrast; adaptiveLightInk = lightInk;
        return changed;
    }

    RECT panelRegion(const RECT& panel) const {
        D3D11_TEXTURE2D_DESC desc{}; desktop->GetDesc(&desc);
        return {std::clamp(panel.left - output.DesktopCoordinates.left - 4, 0L, LONG(desc.Width)),
            std::clamp(panel.top - output.DesktopCoordinates.top - 4, 0L, LONG(desc.Height)),
            std::clamp(panel.right - output.DesktopCoordinates.left + 4, 0L, LONG(desc.Width)),
            std::clamp(panel.bottom - output.DesktopCoordinates.top + 4, 0L, LONG(desc.Height))};
    }

    void rememberPresented(const RECT& panel) {
        RECT region = panelRegion(panel);
        if (IsRectEmpty(&region)) {referenceValid = false; return;}
        D3D11_TEXTURE2D_DESC desc{};
        if (presentedPatch) presentedPatch->GetDesc(&desc);
        const UINT w = region.right - region.left, h = region.bottom - region.top;
        if (!presentedPatch || desc.Width != w || desc.Height != h) {
            presentedPatchView.Reset(); presentedPatch.Reset();
            desc = {}; desc.Width = w; desc.Height = h; desc.MipLevels = desc.ArraySize = 1;
            desc.Format = DXGI_FORMAT_B8G8R8A8_UNORM; desc.SampleDesc.Count = 1;
            desc.Usage = D3D11_USAGE_DEFAULT; desc.BindFlags = D3D11_BIND_SHADER_RESOURCE;
            check(device->CreateTexture2D(&desc, nullptr, &presentedPatch), "Presented background patch");
            check(device->CreateShaderResourceView(presentedPatch.Get(), nullptr, &presentedPatchView), "Presented background view");
        }
        D3D11_BOX box{UINT(region.left), UINT(region.top), 0, UINT(region.right), UINT(region.bottom), 1};
        context->CopySubresourceRegion(presentedPatch.Get(), 0, 0, 0, 0, desktop.Get(), 0, &box);
        referenceRegion = region; referenceValid = true;
    }

    void probeActivity() {
        const UINT zero[4]{}; context->ClearUnorderedAccessViewUint(activityResultView.Get(), zero);
        const UINT region[]{UINT(referenceRegion.left), UINT(referenceRegion.top),
            UINT(referenceRegion.right - referenceRegion.left), UINT(referenceRegion.bottom - referenceRegion.top)};
        context->UpdateSubresource(activityRegion.Get(), 0, nullptr, region, 0, 0);
        ID3D11ShaderResourceView* inputs[]{desktopView.Get(), presentedPatchView.Get()};
        context->CSSetShader(activityShader.Get(), nullptr, 0);
        context->CSSetConstantBuffers(0, 1, activityRegion.GetAddressOf());
        context->CSSetShaderResources(0, 2, inputs);
        context->CSSetUnorderedAccessViews(0, 1, activityResultView.GetAddressOf(), nullptr);
        context->Dispatch((region[2] + 15) / 16, (region[3] + 15) / 16, 1);
        ID3D11ShaderResourceView* emptyInputs[2]{}; ID3D11UnorderedAccessView* emptyOutput = nullptr;
        context->CSSetShaderResources(0, 2, emptyInputs);
        context->CSSetUnorderedAccessViews(0, 1, &emptyOutput, nullptr);
        context->CopyResource(activityReadback.Get(), activityResult.Get());
        context->End(activityReady.Get()); activityPending = true; probedVersion = backgroundVersion;
    }

    // 返回 -1 表示结果尚未就绪，0 表示像素相同，1 表示背景发生变化。
    int readActivity() {
        if (!activityPending) return -1;
        HRESULT ready = context->GetData(activityReady.Get(), nullptr, 0, D3D11_ASYNC_GETDATA_DONOTFLUSH);
        if (ready == S_FALSE) return -1;
        check(ready, "Background comparison completion");
        D3D11_MAPPED_SUBRESOURCE pixels{};
        HRESULT mapped = context->Map(activityReadback.Get(), 0, D3D11_MAP_READ, D3D11_MAP_FLAG_DO_NOT_WAIT, &pixels);
        if (mapped == DXGI_ERROR_WAS_STILL_DRAWING) return -1;
        check(mapped, "Read background comparison");
        const bool changed = *static_cast<UINT*>(pixels.pData) != 0;
        context->Unmap(activityReadback.Get(), 0); activityPending = false;
        return changed ? 1 : 0;
    }

public:
    Renderer() {
        capture=desktopFor(MonitorFromWindow(windowHandle,MONITOR_DEFAULTTONEAREST));
        std::lock_guard<std::mutex> lock(capture->mutex);
        device=capture->device;context=capture->context;desktop=capture->desktop;desktopView=capture->desktopView;
        output=capture->output;
        auto factory=capture->factory;
        D3D11_TEXTURE2D_DESC texture{};desktop->GetDesc(&texture);
        auto sampleTexture = texture;
        sampleTexture.Width = 5; sampleTexture.Height = 3; sampleTexture.Usage = D3D11_USAGE_STAGING;
        sampleTexture.BindFlags = 0; sampleTexture.CPUAccessFlags = D3D11_CPU_ACCESS_READ;
        check(device->CreateTexture2D(&sampleTexture, nullptr, &samples), "Backdrop samples");
        D3D11_QUERY_DESC query{D3D11_QUERY_EVENT, 0}; check(device->CreateQuery(&query, &sampleReady), "Background sample query");
        ComPtr<IDXGIFactory2> factory2; check(factory.As(&factory2), "IDXGIFactory2");
        DXGI_SWAP_CHAIN_DESC1 swap{};
        swap.Width = width; swap.Height = height; swap.Format = DXGI_FORMAT_B8G8R8A8_UNORM;
        swap.SampleDesc.Count = 1; swap.BufferUsage = DXGI_USAGE_RENDER_TARGET_OUTPUT; swap.BufferCount = 2;
        swap.Scaling = DXGI_SCALING_STRETCH; swap.SwapEffect = DXGI_SWAP_EFFECT_FLIP_SEQUENTIAL;
        swap.AlphaMode = DXGI_ALPHA_MODE_PREMULTIPLIED;
        swap.Flags = DXGI_SWAP_CHAIN_FLAG_FRAME_LATENCY_WAITABLE_OBJECT;
        check(factory2->CreateSwapChainForComposition(device.Get(), &swap, nullptr, &swapChain), "Composition swapchain");
        ComPtr<IDXGISwapChain2> swap2; check(swapChain.As(&swap2), "Frame latency swapchain");
        check(swap2->SetMaximumFrameLatency(1), "Maximum frame latency");
        frameReady = swap2->GetFrameLatencyWaitableObject();
        if (!frameReady) throw std::runtime_error("Frame latency wait handle unavailable");
        ComPtr<IDXGIDevice> dxgiDevice; check(device.As(&dxgiDevice), "IDXGIDevice");
        check(DCompositionCreateDevice(dxgiDevice.Get(), IID_PPV_ARGS(&composition)), "DCompositionCreateDevice");
        check(composition->CreateTargetForHwnd(windowHandle, FALSE, &compositionTarget), "Composition target");
        check(composition->CreateVisual(&visual), "Composition visual");
        check(visual->SetContent(swapChain.Get()), "Visual content");
        check(compositionTarget->SetRoot(visual.Get()), "Composition root");
        check(composition->Commit(), "Composition commit");
        createTargets();
        ComPtr<ID3DBlob> vs, ps, error;
        HRESULT hr = D3DCompile(glassShader, sizeof(glassShader), "glass", nullptr, nullptr, "vsMain", "vs_5_0", D3DCOMPILE_OPTIMIZATION_LEVEL3, 0, &vs, &error);
        check(hr, "Compile vertex shader");
        error.Reset();
        hr = D3DCompile(glassShader, sizeof(glassShader), "glass", nullptr, nullptr, "psMain", "ps_5_0", D3DCOMPILE_OPTIMIZATION_LEVEL3, 0, &ps, &error);
        check(hr, "Compile pixel shader");
        check(device->CreateVertexShader(vs->GetBufferPointer(), vs->GetBufferSize(), nullptr, &vertexShader), "Vertex shader");
        check(device->CreatePixelShader(ps->GetBufferPointer(), ps->GetBufferSize(), nullptr, &pixelShader), "Pixel shader");
        D3D11_BUFFER_DESC buffer{}; buffer.ByteWidth = sizeof(Settings); buffer.Usage = D3D11_USAGE_DYNAMIC;
        buffer.BindFlags = D3D11_BIND_CONSTANT_BUFFER; buffer.CPUAccessFlags = D3D11_CPU_ACCESS_WRITE;
        check(device->CreateBuffer(&buffer, nullptr, &constants), "Settings buffer");
        D3D11_SAMPLER_DESC sample{}; sample.Filter = D3D11_FILTER_MIN_MAG_MIP_LINEAR;
        sample.AddressU = sample.AddressV = sample.AddressW = D3D11_TEXTURE_ADDRESS_CLAMP;
        sample.MaxLOD = D3D11_FLOAT32_MAX;
        check(device->CreateSamplerState(&sample, &sampler), "Scene sampler");
        ComPtr<ID3DBlob> compute; error.Reset();
        hr = D3DCompile(activityShaderSource, sizeof(activityShaderSource), "activity", nullptr, nullptr, "csMain", "cs_5_0", D3DCOMPILE_OPTIMIZATION_LEVEL3, 0, &compute, &error);
        check(hr, "Compile background comparison");
        check(device->CreateComputeShader(compute->GetBufferPointer(), compute->GetBufferSize(), nullptr, &activityShader), "Background comparison shader");
        D3D11_BUFFER_DESC activity{}; activity.ByteWidth = 16; activity.Usage = D3D11_USAGE_DEFAULT; activity.BindFlags = D3D11_BIND_CONSTANT_BUFFER;
        check(device->CreateBuffer(&activity, nullptr, &activityRegion), "Comparison region");
        activity.ByteWidth = 4; activity.BindFlags = D3D11_BIND_UNORDERED_ACCESS;
        activity.MiscFlags = D3D11_RESOURCE_MISC_BUFFER_STRUCTURED; activity.StructureByteStride = 4;
        check(device->CreateBuffer(&activity, nullptr, &activityResult), "Comparison result");
        D3D11_UNORDERED_ACCESS_VIEW_DESC result{}; result.ViewDimension = D3D11_UAV_DIMENSION_BUFFER; result.Buffer.NumElements = 1;
        check(device->CreateUnorderedAccessView(activityResult.Get(), &result, &activityResultView), "Comparison result view");
        activity.Usage = D3D11_USAGE_STAGING; activity.BindFlags = 0; activity.MiscFlags = 0;
        activity.StructureByteStride = 0; activity.CPUAccessFlags = D3D11_CPU_ACCESS_READ;
        check(device->CreateBuffer(&activity, nullptr, &activityReadback), "Comparison readback");
        check(device->CreateQuery(&query, &activityReady), "Comparison query");
    }

    void resize() {
        RECT client{}; GetClientRect(windowHandle, &client);
        UINT w = std::max(1L, client.right), h = std::max(1L, client.bottom);
        if (w == width && h == height) return;
        target.Reset();
        context->OMSetRenderTargets(0, nullptr, nullptr);
        check(swapChain->ResizeBuffers(0, w, h, DXGI_FORMAT_UNKNOWN, DXGI_SWAP_CHAIN_FLAG_FRAME_LATENCY_WAITABLE_OBJECT), "ResizeBuffers");
        width = w; height = h; createTargets();
    }

    void render() try {
        if (!IsWindowVisible(windowHandle) || IsIconic(windowHandle)) {
            {std::lock_guard<std::mutex> lock(capture->mutex);
                if(captureActive) {captureActive=false;if(--capture->active==0) {capture->duplication.Reset();capture->hasDesktop=false;}}
            }
            hasDesktop=false;referenceValid=false;firstDraw=true;idle=false;
            WaitForSingleObject(renderWake,INFINITE);return;
        }
        if (!frameAvailable) {
            if (WaitForSingleObject(frameReady, 16) != WAIT_OBJECT_0) return;
            frameAvailable = true;
        }

        std::unique_lock<std::mutex> lock(capture->mutex);
        if(capture->failed) throw std::runtime_error("Desktop capture changed");
        if(!captureActive) {captureActive=true;++capture->active;}
        RECT position{}; GetWindowRect(windowHandle, &position);
        const bool geometryChanged = !EqualRect(&position, &lastPosition);
        const bool surfaceDark = darkMode.load();
        const float surfaceLens = lensStrength.load();
        const bool dragging = moving.load();
        const int activity = readActivity();

        const bool colorChanged = readSamples();

        const auto revision = current->revision.load();
        const bool forced = revision != lastRevision || firstDraw || geometryChanged || dragging || colorChanged || surfaceDark != lastDark || surfaceLens != lastLens;
        auto now = Clock::now();
        if (forced || activity == 1) {lastRealChange = now; idle = false;}
        else if (activity == 0 && now - lastRealChange >= std::chrono::milliseconds(250)) idle = true;
        resize();
        capture->acquire();
        bool affected = capture->version != seenVersion;
        seenVersion=capture->version;hasDesktop=capture->hasDesktop;
        if(affected) ++backgroundVersion;
        bool needsDraw = forced || activity == 1 || (!idle && affected);
        const RECT region = panelRegion(position);
        if (hasDesktop && referenceValid && !geometryChanged && !dragging && !activityPending
            && EqualRect(&region, &referenceRegion) && (affected || backgroundVersion != probedVersion)) {
            probeActivity();
            if (!needsDraw) context->Flush();
        }
        if (!hasDesktop || !needsDraw) {lock.unlock();WaitForSingleObject(renderWake,16);return;}
        // Capture may wait for an update; use the current position when drawing.
        GetWindowRect(windowHandle, &position);
        D3D11_TEXTURE2D_DESC desc{}; desktop->GetDesc(&desc);
        now = Clock::now();
        if (!samplePending && now - lastSample > std::chrono::milliseconds(250)) {
            for (UINT sy = 0; sy < 3; ++sy) for (UINT sx = 0; sx < 5; ++sx) {
                UINT x = UINT(std::clamp(position.left - output.DesktopCoordinates.left + LONG((sx + 0.5f) * width / 5), 0L, LONG(desc.Width - 1)));
                UINT y = UINT(std::clamp(position.top - output.DesktopCoordinates.top + LONG((sy + 0.5f) * height / 3), 0L, LONG(desc.Height - 1)));
                D3D11_BOX box{x, y, 0, x + 1, y + 1, 1};
                context->CopySubresourceRegion(samples.Get(), 0, sx, sy, 0, desktop.Get(), 0, &box);
            }
            context->End(sampleReady.Get()); samplePending = true; lastSample = now;
        }
        float scale = GetDpiForWindow(windowHandle) / 96.0f;
        Settings settings{float(width), float(height), float(desc.Width), float(desc.Height),
            float(position.left - output.DesktopCoordinates.left), float(position.top - output.DesktopCoordinates.top),
            current->radius.load(), std::min(38 * scale, std::min(width, height) / 3.5f), surfaceDark ? 1.0f : 0.0f, surfaceLens, backdropLuminance, backdropContrast,
            current->tint.load(), current->colorR.load(), current->colorG.load(), current->colorB.load(), current->colorA.load(), 0, 0, 0};
        D3D11_MAPPED_SUBRESOURCE mapped{}; check(context->Map(constants.Get(), 0, D3D11_MAP_WRITE_DISCARD, 0, &mapped), "Map settings");
        memcpy(mapped.pData, &settings, sizeof(settings)); context->Unmap(constants.Get(), 0);
        const float clear[4]{}; context->ClearRenderTargetView(target.Get(), clear);
        context->OMSetRenderTargets(1, target.GetAddressOf(), nullptr);
        D3D11_VIEWPORT viewport{0, 0, float(width), float(height), 0, 1}; context->RSSetViewports(1, &viewport);
        context->IASetPrimitiveTopology(D3D11_PRIMITIVE_TOPOLOGY_TRIANGLELIST);
        context->VSSetShader(vertexShader.Get(), nullptr, 0); context->PSSetShader(pixelShader.Get(), nullptr, 0);
        context->PSSetConstantBuffers(0, 1, constants.GetAddressOf()); context->PSSetShaderResources(0, 1, desktopView.GetAddressOf());
        context->PSSetSamplers(0, 1, sampler.GetAddressOf()); context->Draw(3, 0);
        context->OMSetRenderTargets(0, nullptr, nullptr);
        rememberPresented(position);

        // DXGI 提交也会访问共享的即时上下文，与其他窗口的绘制串行执行。
        check(swapChain->Present(1, 0), "Present");

        frameAvailable = false; firstDraw = false; lastPosition = position; lastDark = surfaceDark; lastLens = surfaceLens; lastRevision = revision;
    }
    catch (...) {
        std::lock_guard<std::mutex> lock(capture->mutex);
        if(FAILED(device->GetDeviceRemovedReason())) capture->failed=true;
        throw;
    }
    ~Renderer() {
        if(capture) {std::lock_guard<std::mutex> lock(capture->mutex);
            if(captureActive && --capture->active==0) {capture->duplication.Reset();capture->hasDesktop=false;}
        }
        if(compositionTarget) {compositionTarget->SetRoot(nullptr);composition->Commit();}

        if (frameReady) CloseHandle(frameReady);
    }
};

#undef windowHandle
#undef running
#undef darkMode
#undef moving
#undef renderWake
static constexpr UINT_PTR subclassId = 0x474C4153;
static constexpr wchar_t surfaceProperty[] = L"DanmuLiquidGlass";
static bool excludeDesktopCopy(HWND window, bool exclude) {
    struct Data {int attribute; void* data; size_t size;};
    using Apply = BOOL(WINAPI*)(HWND,Data*);
    auto apply = reinterpret_cast<Apply>(GetProcAddress(GetModuleHandleW(L"user32.dll"),"SetWindowCompositionAttribute"));
    BOOL value=exclude; Data data{24,&value,sizeof(value)};
    return apply && apply(window,&data);
}
static LRESULT CALLBACK surfaceProc(HWND hwnd,UINT message,WPARAM wparam,LPARAM lparam,UINT_PTR,DWORD_PTR reference) {
    auto state=reinterpret_cast<Surface*>(reference);
    if(message==WM_ENTERSIZEMOVE) state->moving=true;
    if(message==WM_EXITSIZEMOVE) state->moving=false;
    if(message==WM_NCDESTROY) {
        RemoveWindowSubclass(hwnd,surfaceProc,subclassId);
        RemovePropW(hwnd,surfaceProperty);
        delete state;
        return DefSubclassProc(hwnd,message,wparam,lparam);
    }
    auto result=DefSubclassProc(hwnd,message,wparam,lparam);
    if(message==WM_WINDOWPOSCHANGED || message==WM_SIZE || message==WM_SHOWWINDOW || message==WM_DISPLAYCHANGE || message==WM_DPICHANGED || message==WM_ENTERSIZEMOVE || message==WM_EXITSIZEMOVE) SetEvent(state->wake);
    return result;
}
extern "C" int danmu_glass_set(HWND hwnd,int enabled,int dark,float radius,float tint,const float* color,char* error,size_t capacity) {
    auto copyError=[&](const char* text) { if(capacity) strncpy_s(error,capacity,text,_TRUNCATE); return 0; };
    auto state=reinterpret_cast<Surface*>(GetPropW(hwnd,surfaceProperty));
    if(!enabled) {
        if(state) {
            RemoveWindowSubclass(hwnd,surfaceProc,subclassId); RemovePropW(hwnd,surfaceProperty);
            delete state; excludeDesktopCopy(hwnd,false);
        }
        return 1;
    }
    auto update=[&](Surface* value) {
        value->dark=dark!=0; value->radius=radius; value->tint=tint;
        value->colorR=color?color[0]:0; value->colorG=color?color[1]:0; value->colorB=color?color[2]:0; value->colorA=color?color[3]:-1;
        ++value->revision; SetEvent(value->wake);
    };
    if(state) {update(state);return 1;}
    std::unique_ptr<Surface> owned(new Surface); owned->hwnd=hwnd; update(owned.get());
    if(!excludeDesktopCopy(hwnd,true)) return copyError("Unable to exclude glass from desktop feedback");
    state=owned.get();
    state->thread=std::thread([state] {
        current=state;
        bool initialized=false;
        while(state->running) {
            try {
                Renderer renderer;
                HMONITOR monitor=MonitorFromWindow(state->hwnd,MONITOR_DEFAULTTONEAREST);
                initialized=true; SetEvent(state->ready);
                while(state->running && monitor==MonitorFromWindow(state->hwnd,MONITOR_DEFAULTTONEAREST)) renderer.render();
            } catch(const std::exception& exception) {
                if(!initialized) {state->error=exception.what(); SetEvent(state->ready); return;}
                WaitForSingleObject(state->wake,250);
            }
        }
    });
    WaitForSingleObject(state->ready,INFINITE);
    if(!state->error.empty()) {excludeDesktopCopy(hwnd,false);return copyError(state->error.c_str());}
    if(!SetPropW(hwnd,surfaceProperty,state) || !SetWindowSubclass(hwnd,surfaceProc,subclassId,reinterpret_cast<DWORD_PTR>(state))) {
        RemovePropW(hwnd,surfaceProperty); excludeDesktopCopy(hwnd,false); return copyError("Unable to attach glass to window");
    }
    owned.release(); return 1;
}
