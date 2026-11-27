uniform float uTime;
uniform vec3 uSunDir;
uniform vec3 uFogColor;
uniform float uDetailLevel;

varying vec3 vWorldPos;
varying vec3 vNormal;
varying float vWaveHeight;

void main() {
  vec3 viewDir = normalize(cameraPosition - vWorldPos);
  float dist = length(cameraPosition - vWorldPos);
  float distFade = 1.0 - smoothstep(12.0, 52.0, dist);

  // 多尺度程序化水面微波纹（随距离自适应衰减，消除远景走样闪烁）
  float rippleA = sin(vWorldPos.x * 2.1 + vWorldPos.z * 1.6 - uTime * 1.6);
  float rippleB = cos(vWorldPos.x * -1.7 + vWorldPos.z * 2.4 + uTime * 1.25);
  float microRipple = sin(vWorldPos.x * 4.8 - vWorldPos.z * 3.9 + uTime * 2.1) * 0.45;
  vec3 rippleOffset = vec3(rippleA + microRipple, 0.0, rippleB - microRipple) * (0.048 * uDetailLevel * distFade);
  vec3 normal = normalize(vNormal + rippleOffset);

  // 粉紫蓝梦幻海面基色 + 柔和珍珠色散近似（非真实光线追踪）
  vec3 deepColor = vec3(0.70, 0.63, 0.94);     // 柔和蓝紫
  vec3 shallowColor = vec3(0.95, 0.77, 0.94);  // 粉紫珍珠
  vec3 crestTint = vec3(1.0, 0.90, 0.98);      // 浪峰柔粉高光

  float waveFactor = clamp(vWaveHeight * 1.35 + 0.5, 0.0, 1.0);
  vec3 baseColor = mix(deepColor, shallowColor, waveFactor);
  baseColor = mix(baseColor, crestTint, smoothstep(0.62, 0.98, waveFactor) * 0.48);

  // 柔和珍珠色散近似
  float irid = sin(dot(normal, viewDir) * 7.0 + uTime * 0.4) * 0.5 + 0.5;
  vec3 pearlShift = mix(vec3(0.98, 0.82, 0.96), vec3(0.82, 0.90, 1.0), irid);
  baseColor = mix(baseColor, pearlShift, 0.14 * uDetailLevel);

  // Fresnel 边缘天光近似反射
  float fresnel = pow(1.0 - max(dot(viewDir, normal), 0.0), 3.1);
  vec3 skyReflect = vec3(0.99, 0.89, 0.98);
  vec3 color = mix(baseColor, skyReflect, fresnel * 0.65);

  // 方向性太阳光倒影 + 柔和镜面衰减
  vec3 sunDir = normalize(uSunDir);
  vec3 halfVec = normalize(sunDir + viewDir);
  float spec = pow(max(dot(normal, halfVec), 0.0), 48.0);
  float shimmer = pow(max(dot(normal, halfVec), 0.0), 11.0);
  float sunPath = smoothstep(0.75, 0.99, max(dot(reflect(-viewDir, vec3(0.0, 1.0, 0.0)), sunDir), 0.0));
  color += vec3(1.0, 0.93, 0.97) * spec * 0.62;
  color += vec3(0.98, 0.82, 0.95) * (shimmer * 0.16 + sunPath * 0.18);

  // 距离雾化与海平线自然融合
  float fogFactor = smoothstep(14.0, 56.0, dist);
  color = mix(color, uFogColor, fogFactor);

  gl_FragColor = vec4(color, 0.94);
}
