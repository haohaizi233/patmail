/**
 * jsdom 没有 canvas 实现，每次量字宽都会抛一大串 "Not implemented" 噪音，
 * 把真正的失败淹掉。这里让 getContext 安静地返回 null：量宽代码本来就会退到
 * 离屏 span / 估算值，行为不变，只是不再打错误日志。
 */
HTMLCanvasElement.prototype.getContext = function getContext() {
  return null
} as typeof HTMLCanvasElement.prototype.getContext

/**
 * 测试不依赖开发机 .env：模型密钥字段固定为测试值。
 * 否则本机有 .env 时密钥非空、CI 没有 .env 时为空，同一断言两种结果
 * （空密钥下 Headers 会把 "Bearer " 规范化成 "Bearer"，请求头断言就翻了）。
 */
import.meta.env.VITE_AGENT_DEFAULT_KEY = 'unit-test-agent-key'
import.meta.env.VITE_AGENT_FALLBACK_KEY = 'unit-test-fallback-key'
