import NebulaCanvas from "@/components/NebulaCanvas";

export default function HomePage() {
  // Break out of the layout's container padding to fill the viewport below the nav (h-14 = 3.5rem)
  return (
    <div
      className="-mx-4 -my-8 overflow-hidden"
      style={{ height: "calc(100dvh - 3.5rem)" }}
    >
      <NebulaCanvas />
    </div>
  );
}
