import type { CategoryArtKind } from "../../shared/home.js";
import { Music2 } from "lucide-react";
export function CategoryArt({ kind }: { kind: CategoryArtKind }) {
  return (
    <div className={`category-art ${kind}`} aria-hidden="true">
      <Music2 size={110} strokeWidth={1.1} />
    </div>
  );
}
