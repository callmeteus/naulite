/**
 * Default compose manifest shown in deploy editors.
 */
export const DEFAULT_MANIFEST_YAML = `name: minimal

services:
  web:
    image: nginx:1.27-alpine
    ports:
      - "8080:80"
`;
