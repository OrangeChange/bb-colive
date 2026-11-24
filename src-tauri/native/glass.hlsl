cbuffer Settings : register(b0) {
    float2 panelSize;
    float2 desktopSize;
    float2 screenOrigin;
    float radius;
    float rim;
    float dark;
    float lensStrength;
    float backdropLuminance;
    float backdropContrast;
    float glassTint;
    float3 surfaceColor;
    float surfaceAlpha;
    float3 padding;
};
Texture2D scene : register(t0);
SamplerState sceneSampler : register(s0);

struct VertexOut { float4 position : SV_Position; float2 uv : TEXCOORD0; };
VertexOut vsMain(uint id : SV_VertexID) {
    VertexOut o;
    o.uv = float2((id << 1) & 2, id & 2);
    o.position = float4(o.uv * float2(2, -2) + float2(-1, 1), 0, 1);
    return o;
}

float3 sampleScene(float2 pixel) {
    return scene.Sample(sceneSampler, pixel / desktopSize).rgb;
}

float4 psMain(VertexOut input) : SV_Target {
    float2 p = input.uv * panelSize;
    float2 centered = p - panelSize * 0.5;
    float2 q = abs(centered) - (panelSize * 0.5 - radius);
    float distance = length(max(q, 0)) + min(max(q.x, q.y), 0) - radius;
    float coverage = 1 - smoothstep(-0.85, 0.85, distance);
    if (coverage <= 0) return 0;

    float2 outward;
    if (max(q.x, q.y) > 0) outward = normalize(max(q, 0)) * sign(centered);
    else outward = q.x > q.y ? float2(sign(centered.x), 0) : float2(0, sign(centered.y));
    float inwardDistance = max(0, -distance);
    float edge = pow(saturate(1 - inwardDistance / rim), 2.6);
    float2 bend = -outward * (rim * 0.77 * lensStrength * edge);
    float2 origin = screenOrigin + p;
    float3 color;
    color.r = sampleScene(origin + bend * 1.025).r;
    color.g = sampleScene(origin + bend).g;
    color.b = sampleScene(origin + bend * 0.975).b;
    float2 samplePosition = origin + bend;
    float3 neighbors = sampleScene(samplePosition) * 0.25;
    neighbors += (sampleScene(samplePosition + float2(2, 0)) + sampleScene(samplePosition - float2(2, 0))
                + sampleScene(samplePosition + float2(0, 2)) + sampleScene(samplePosition - float2(0, 2))) * 0.125;
    neighbors += (sampleScene(samplePosition + float2(2, 2)) + sampleScene(samplePosition + float2(-2, 2))
                + sampleScene(samplePosition + float2(2, -2)) + sampleScene(samplePosition - float2(2, 2))) * 0.0625;
    color = lerp(color, neighbors, 0.85);
    bool darkSurface = dark > 0.5;
    float density = saturate(0.55 * (darkSurface ? backdropLuminance : 1 - backdropLuminance) + 0.7 * backdropContrast);
    float tint = dark > 0.5 ? lerp(0.16, 0.38, density) : darkSurface ? lerp(0.10, 0.30, density) : lerp(0.06, 0.22, density);
    tint = glassTint <= 0.18 ? tint * glassTint / 0.18 : lerp(tint, 1, (glassTint - 0.18) / 0.82);
    float3 tintColor = surfaceAlpha < 0 ? (darkSurface ? float3(20.0 / 255, 20.0 / 255, 24.0 / 255) : float3(1, 1, 1)) : surfaceColor;
    color = lerp(color, tintColor, tint * (surfaceAlpha < 0 ? 1 : surfaceAlpha));

    float lightDirection = dot(outward, normalize(float2(-0.7, -0.7)));
    float hairline = exp(-abs(distance + 0.7) * 2.1);
    float innerLight = exp(-abs(distance + 3.0) * 0.7);
    float highlight = hairline * (0.22 + 0.50 * abs(lightDirection)) + innerLight * saturate(lightDirection) * 0.10;
    color = lerp(color, 1, saturate(highlight * (darkSurface ? 0.45 : 1)));
    color *= 1 - exp(-abs(distance + 5) * 0.5) * saturate(-lightDirection) * 0.09;
    return float4(color * coverage, coverage);
}
