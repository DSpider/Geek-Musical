import { PostsList } from "./PostsList.js";
import { PostEditor } from "./PostEditor.js";
export function PostsPage() {
  const edit = new URLSearchParams(window.location.search).get("edit");
  return edit ? <PostEditor id={edit} /> : <PostsList />;
}
