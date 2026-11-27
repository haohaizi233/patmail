export interface DisposableResource {
  dispose(): void
}

/**
 * 集中追踪 Three.js Geometry / Material / Texture / InstancedMesh 等显存资源，
 * 支持单资源精确释放、替换即回收与全量安全销毁，杜绝重复切换导致的引用堆积。
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

  release(resource: DisposableResource | null | undefined): void {
    if (!resource || !this.resources.delete(resource)) {
      return
    }
    try {
      resource.dispose()
    } catch {
      // 忽略单项资源重复释放或上下文已销毁导致的异常
    }
  }

  replace<T extends DisposableResource>(previous: T | null | undefined, next: T): T {
    this.track(next)
    if (previous && previous !== next) {
      this.release(previous)
    }
    return next
  }

  get count(): number {
    return this.resources.size
  }

  disposeAll(): void {
    const pending = [...this.resources]
    this.resources.clear()
    for (const resource of pending) {
      try {
        resource.dispose()
      } catch {
        // 忽略单项释放异常，确保其余资源全部回收
      }
    }
  }
}
