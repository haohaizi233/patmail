uniform float uTime;
uniform float uWaveScale;

varying vec3 vWorldPos;
varying vec3 vNormal;
varying float vWaveHeight;

void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  float x = world.x;
  float z = world.z;

  // 4 组不同波长、频率、方向的柔和正弦波与轻度 Gerstner 偏移
  float w1 = sin(x * 0.24 + z * 0.16 - uTime * 0.95) * 0.22;
  float w2 = sin(x * -0.17 + z * 0.31 - uTime * 1.18 + 1.3) * 0.15;
  float w3 = sin(x * 0.42 + z * -0.22 - uTime * 1.45 + 2.7) * 0.08;
  float w4 = sin(x * 0.68 + z * 0.52 - uTime * 1.80 + 0.6) * 0.04;

  float h = (w1 + w2 + w3 + w4) * uWaveScale;

  // 水平轻度 Gerstner 偏移，避免尖锐折角
  float gx = cos(x * 0.24 + z * 0.16 - uTime * 0.95) * 0.08 * uWaveScale;
  float gz = cos(x * -0.17 + z * 0.31 - uTime * 1.18 + 1.3) * 0.06 * uWaveScale;

  world.x += gx;
  world.y += h;
  world.z += gz;

  // 解析法线近似
  float dhdx = (
    cos(x * 0.24 + z * 0.16 - uTime * 0.95) * 0.22 * 0.24 +
    cos(x * -0.17 + z * 0.31 - uTime * 1.18 + 1.3) * 0.15 * -0.17 +
    cos(x * 0.42 + z * -0.22 - uTime * 1.45 + 2.7) * 0.08 * 0.42 +
    cos(x * 0.68 + z * 0.52 - uTime * 1.80 + 0.6) * 0.04 * 0.68
  ) * uWaveScale;

  float dhdz = (
    cos(x * 0.24 + z * 0.16 - uTime * 0.95) * 0.22 * 0.16 +
    cos(x * -0.17 + z * 0.31 - uTime * 1.18 + 1.3) * 0.15 * 0.31 +
    cos(x * 0.42 + z * -0.22 - uTime * 1.45 + 2.7) * 0.08 * -0.22 +
    cos(x * 0.68 + z * 0.52 - uTime * 1.80 + 0.6) * 0.04 * 0.52
  ) * uWaveScale;

  vNormal = normalize(vec3(-dhdx, 1.0, -dhdz));
  vWorldPos = world.xyz;
  vWaveHeight = h;

  gl_Position = projectionMatrix * viewMatrix * world;
}
