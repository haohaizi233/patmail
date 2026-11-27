import { PerspectiveCamera, Vector3 } from 'three'

export class OceanCameraRig {
  readonly camera: PerspectiveCamera
  private readonly basePos = new Vector3(0, 4.4, 14.5)
  private readonly lookAtBase = new Vector3(0, 1.35, -8.0)
  private readonly currentLookAt = new Vector3(0, 1.35, -8.0)
  private targetX = 0
  private targetY = 0
  private readonly dampingLambda = 4.2

  constructor(aspect = 16 / 9) {
    this.camera = new PerspectiveCamera(42, aspect, 0.2, 160)
    this.camera.position.copy(this.basePos)
    this.camera.lookAt(this.currentLookAt)
  }

  resize(width: number, height: number): void {
    if (width <= 0 || height <= 0) return
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
  }

  setPointerTarget(nx: number, ny: number): void {
    // 严格限幅（±1），防止剧烈视角偏移
    const cx = Math.max(-1, Math.min(1, nx))
    const cy = Math.max(-1, Math.min(1, ny))
    this.targetX = cx * 0.95
    this.targetY = -cy * 0.42
  }

  isSettled(epsilon = 0.002): boolean {
    const goalX = this.basePos.x + this.targetX
    const goalY = this.basePos.y + this.targetY
    const posErr = Math.abs(goalX - this.camera.position.x) + Math.abs(goalY - this.camera.position.y)
    const lookErr =
      Math.abs(this.lookAtBase.x + this.targetX * 0.35 - this.currentLookAt.x) +
      Math.abs(this.lookAtBase.y + this.targetY * 0.25 - this.currentLookAt.y)
    return posErr < epsilon && lookErr < epsilon
  }

  update(dtSeconds: number): void {
    const alpha = 1 - Math.exp(-this.dampingLambda * Math.max(0.001, dtSeconds))
    const goalX = this.basePos.x + this.targetX
    const goalY = this.basePos.y + this.targetY

    this.camera.position.x += (goalX - this.camera.position.x) * alpha
    this.camera.position.y += (goalY - this.camera.position.y) * alpha

    this.currentLookAt.x += (this.lookAtBase.x + this.targetX * 0.35 - this.currentLookAt.x) * alpha
    this.currentLookAt.y += (this.lookAtBase.y + this.targetY * 0.25 - this.currentLookAt.y) * alpha
    this.camera.lookAt(this.currentLookAt)
  }
}
