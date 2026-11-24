cbuffer Region : register(b0) { uint2 origin; uint2 extent; };
Texture2D<float4> currentDesktop : register(t0);
Texture2D<float4> lastPresented : register(t1);
RWStructuredBuffer<uint> changed : register(u0);
groupshared uint groupChanged;
groupshared uint alreadyChanged;

[numthreads(16, 16, 1)]
void csMain(uint3 pixel : SV_DispatchThreadID, uint local : SV_GroupIndex) {
    if (local == 0) {groupChanged = 0; alreadyChanged = changed[0];}
    GroupMemoryBarrierWithGroupSync();
    if (alreadyChanged != 0) return;
    if (all(pixel.xy < extent)) {
        float3 current = currentDesktop.Load(int3(origin + pixel.xy, 0)).rgb;
        float3 previous = lastPresented.Load(int3(pixel.xy, 0)).rgb;
        if (any(current != previous)) InterlockedOr(groupChanged, 1);
    }
    GroupMemoryBarrierWithGroupSync();
    if (local == 0 && groupChanged != 0) InterlockedOr(changed[0], 1);
}
