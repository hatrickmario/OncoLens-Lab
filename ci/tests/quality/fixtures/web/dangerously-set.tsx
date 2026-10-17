export function Texto({ html }: { html: string }) {
  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}
