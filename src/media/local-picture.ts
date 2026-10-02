/** HA sets `entity_picture` to the provider's own URL when art is remotely accessible; the CSP blocks that, so readers get HA's same-origin copy. */
export function preferLocalPicture(
  attributes: Record<string, unknown>,
  storedLocal?: unknown,
): void {
  if (!("entity_picture" in attributes)) return;
  const local = attributes.entity_picture_local ?? storedLocal;
  if (typeof local === "string" && attributes.entity_picture !== local) {
    attributes.entity_picture = local;
  }
}
