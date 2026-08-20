export function formatRenderer(renderer: string): string {
  switch (renderer) {
    case 'static-image': return 'Static image'
    case 'sprite': return 'Sprite animation'
    case 'animated-image': return 'Animated image'
    case 'live2d': return 'Live2D'
    case '3d': return '3D'
    default: return 'Character renderer'
  }
}
