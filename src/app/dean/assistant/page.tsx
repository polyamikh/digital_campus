import DeanWorkspacePage from "../dean-workspace-page";
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) { return <DeanWorkspacePage section="assistant" searchParams={searchParams} />; }
