import type { LoadedCharacter, LoadedCharacterAction } from '../../../../../shared/character'

interface StaticImageRendererProps {
  character: LoadedCharacter
  action: LoadedCharacterAction
  actionName: string
}

export function StaticImageRenderer({
  character,
  action,
  actionName
}: StaticImageRendererProps): React.JSX.Element {
  const { manifest } = character
  const width = manifest.defaultWidth * manifest.scale
  const height = manifest.defaultHeight * manifest.scale

  return (
    <img
      className="character-asset"
      src={action.assetUrl}
      width={width}
      height={height}
      draggable={false}
      alt={`${manifest.name}, ${actionName}`}
    />
  )
}
