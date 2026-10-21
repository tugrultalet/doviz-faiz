import type { Tile } from '@/features/model';
import { Card, Grid, half, T } from '../ui';

/** Market indicators in two columns: title, value, a short note. */
export function Tiles({ tiles }: { tiles: Tile[] }) {
  if (!tiles.length) return null;
  return (
    <Grid>
      {tiles.map((tile) => (
        <Card key={tile.id} style={[half, { gap: 4 }]}>
          <T v="caption" muted numberOfLines={2} style={{ fontWeight: '600' }}>
            {tile.title}
          </T>
          <T v="title" num numberOfLines={1} adjustsFontSizeToFit>
            {tile.value}
            {tile.unit ? <T v="caption" muted>{` ${tile.unit}`}</T> : null}
          </T>
          <T v="caption" muted>
            {tile.note}
          </T>
        </Card>
      ))}
    </Grid>
  );
}
