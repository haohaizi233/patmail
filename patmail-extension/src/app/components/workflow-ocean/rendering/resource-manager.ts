export interface DisposableResource {
  dispose(): void
}

/**
 * 集中追踪 Three.js Geometry / Material / Texture / RenderTarget 等显存资源，
 * 确保切换质量、失活或组件卸载时一次性彻底释放，不留泄漏。
 */
export class OceanResourceManager {
  private readonly resources = new Set<DisposableResource>()

  track<T extends DisposableResource>(resource: T): T {
    this.resources.add(resource)
    return resource
  }

  trackMany<T extends DisposableResource>(items: readonly T[]): void {
    for (const item of items) {
      this.resources.add(item)
    }
  }

  get count(): number {
    return this.resources.size
  }

  disposeAll(): void {
    for (const resource of this.resources) {
      try {
        resource.dispose()
      } catch {
        // 忽略重复释放
      }
    }
    this.resources.clear()
  }
}
