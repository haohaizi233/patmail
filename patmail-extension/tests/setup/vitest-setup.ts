/**
 * jsdom 没有 canvas 实现，每次量字宽都会抛一大串 "Not implemented" 噪音，
 * 把真正的失败淹掉。这里让 getContext 安静地返回 null：量宽代码本来就会退到
 * 离屏 span / 估算值，行为不变，只是不再打错误日志。
 */
HTMLCanvasElement.prototype.getContext = function getContext() {
  return null
} as typeof HTMLCanvasElement.prototype.getContext
