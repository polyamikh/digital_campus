import DeanWorkspacePage from "./dean-workspace-page";

export default function DeanHomePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <DeanWorkspacePage section="home" searchParams={searchParams} />;
}
