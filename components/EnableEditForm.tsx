import { Input, Button } from "@/components/ui";

export function EnableEditForm({
  returnTo,
  compact = false,
}: {
  returnTo: string;
  compact?: boolean;
}) {
  return (
    <form
      action="/api/edit"
      method="get"
      className={compact ? "flex flex-wrap items-center gap-2" : "grid gap-2 sm:grid-cols-[1fr_auto]"}
    >
      <input type="hidden" name="r" value={returnTo} />
      <Input
        name="key"
        type="password"
        placeholder="Enter edit key"
        autoComplete="off"
        className={compact ? "min-w-[220px]" : undefined}
      />
      <Button type="submit">Enable edit mode</Button>
    </form>
  );
}
