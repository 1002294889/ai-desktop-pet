import type {
  LoadedCharacter,
  LoadedStaticCharacterAction
} from '../../../../../shared/character'
import type { PetAction } from '../../../../../shared/pet-action'

interface StaticImageRendererProps {
  character: LoadedCharacter
  action: LoadedStaticCharacterAction
  requestedActionName: PetAction
  renderedActionName: string
}

export function StaticImageRenderer({
  character,
  action,
  requestedActionName,
  renderedActionName
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
      alt={
        requestedActionName === renderedActionName
          ? `${manifest.name}, ${requestedActionName}`
          : `${manifest.name}, ${requestedActionName}, using ${renderedActionName} fallback`
      }
    />
  )
}
