varying vec2 vUv;

void main() {
  // 从底部珍珠粉紫渐变到顶部柔和天穹粉蓝
  vec3 horizon = vec3(0.97, 0.87, 0.98);
  vec3 midSky = vec3(0.92, 0.81, 0.97);
  vec3 zenith = vec3(0.82, 0.78, 0.97);

  float y = clamp(vUv.y, 0.0, 1.0);
  vec3 col = mix(horizon, midSky, smoothstep(0.0, 0.48, y));
  col = mix(col, zenith, smoothstep(0.42, 1.0, y));

  // 左上角柔和太阳光晕
  vec2 sunPos = vec2(0.28, 0.64);
  float sunDist = distance(vUv, sunPos);
  float sunGlow = exp(-sunDist * 4.2) * 0.34;
  col += vec3(1.0, 0.93, 0.96) * sunGlow;

  gl_FragColor = vec4(col, 1.0);
}
