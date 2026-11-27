uniform float uTime;
uniform vec3 uSunDir;
uniform vec3 uFogColor;
uniform float uDetailLevel;

varying vec3 vWorldPos;
varying vec3 vNormal;
varying float vWaveHeight;

void main() {
  vec3 viewDir = normalize(cameraPosition - vWorldPos);

  // 程序化细腻水面微波纹（无需贴图采样）
  float rippleA = sin(vWorldPos.x * 2.1 + vWorldPos.z * 1.6 - uTime * 1.6);
  float rippleB = cos(vWorldPos.x * -1.7 + vWorldPos.z * 2.4 + uTime * 1.25);
  vec3 rippleOffset = vec3(rippleA, 0.0, rippleB) * (0.045 * uDetailLevel);
  vec3 normal = normalize(vNormal + rippleOffset);

  // 粉紫蓝梦幻海面基色
  vec3 deepColor = vec3(0.71, 0.64, 0.94);     // 柔和蓝紫
  vec3 shallowColor = vec3(0.95, 0.77, 0.94);  // 粉紫珍珠
  vec3 crestTint = vec3(1.0, 0.89, 0.97);      // 浪峰柔粉高光

  float waveFactor = clamp(vWaveHeight * 1.35 + 0.5, 0.0, 1.0);
  vec3 baseColor = mix(deepColor, shallowColor, waveFactor);
  baseColor = mix(baseColor, crestTint, smoothstep(0.62, 0.98, waveFactor) * 0.45);

  // Fresnel 边缘反射
  float fresnel = pow(1.0 - max(dot(viewDir, normal), 0.0), 3.2);
  vec3 skyReflect = vec3(0.99, 0.88, 0.98);
  vec3 color = mix(baseColor, skyReflect, fresnel * 0.62);

  // 柔和太阳光镜面反射 + 水面流动高光
  vec3 sunDir = normalize(uSunDir);
  vec3 halfVec = normalize(sunDir + viewDir);
  float spec = pow(max(dot(normal, halfVec), 0.0), 42.0);
  float shimmer = pow(max(dot(normal, halfVec), 0.0), 10.0);
  color += vec3(1.0, 0.92, 0.97) * spec * 0.58;
  color += vec3(0.98, 0.80, 0.95) * shimmer * 0.16;

  // 距离雾化与远景天际融合
  float dist = length(cameraPosition - vWorldPos);
  float fogFactor = smoothstep(14.0, 56.0, dist);
  color = mix(color, uFogColor, fogFactor);

  gl_FragColor = vec4(color, 0.94);
}
