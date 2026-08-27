import { createFileRoute } from "@tanstack/react-router";
import ResolvedDiningApp from "../ResolvedDiningApp";

export const Route = createFileRoute("/")({
  component: () => <ResolvedDiningApp token="demo" />,
});
