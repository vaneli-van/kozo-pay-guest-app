import { createFileRoute } from "@tanstack/react-router";
import DiningApp from "../DiningApp";

export const Route = createFileRoute("/")({
  component: DiningApp,
});
