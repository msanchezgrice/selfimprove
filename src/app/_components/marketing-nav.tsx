import Link from "next/link";

export default function MarketingNav() {
  return (
    <nav className="w-full border-b border-[#e8e4de] bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link href="/" className="text-xl font-bold tracking-tight text-[#1a1a2e]">
          Self<span className="text-[#0d9488]">Improve</span>
        </Link>

        <div className="hidden items-center gap-8 md:flex">
          <Link
            href="/#how-it-works"
            className="text-sm font-medium text-[#8b8680] transition-colors hover:text-[#1a1a2e]"
          >
            How it works
          </Link>
          <Link
            href="/pricing"
            className="text-sm font-medium text-[#8b8680] transition-colors hover:text-[#1a1a2e]"
          >
            Pricing
          </Link>
          <Link
            href="/docs"
            className="text-sm font-medium text-[#8b8680] transition-colors hover:text-[#1a1a2e]"
          >
            Docs
          </Link>
        </div>

        <Link
          href="/login"
          className="rounded-lg bg-[#0d9488] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#0d9488]/90"
        >
          Get Started
        </Link>
      </div>
    </nav>
  );
}
