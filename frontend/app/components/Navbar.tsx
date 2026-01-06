"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Cookies from "js-cookie";
import { useEffect, useState, Suspense } from "react";
import toast from "react-hot-toast";

/**
 * Inner component for Navbar content to handle search params and routing logic.
 */
function NavbarContent() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Check login status on mount and when path changes
  useEffect(() => {
    const token = Cookies.get("token");
    setIsLoggedIn(!!token);
  }, [pathname]); // Re-run check when user navigates

  // Close mobile menu automatically when route changes
  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [pathname]);

  /**
   * Handles user logout by removing the token cookie.
   */
  const handleLogout = () => {
    Cookies.remove("token");
    setIsLoggedIn(false);
    toast.success("Logged out");
    router.push("/login");
    router.refresh(); // Refresh to update server components if any
  };

  /**
   * Generates CSS classes for desktop navigation links based on active state.
   */
  const getDesktopLinkClass = (path: string, viewParam?: string) => {
    const base = "text-sm font-medium px-3 py-2 rounded-md transition-colors";
    let isActive = pathname === path;

    if (isActive && path === "/anime") {
      const currentView = searchParams?.get("view");
      if (viewParam) isActive = currentView === viewParam;
      else isActive = !currentView;
    }

    if (isActive) {
      return `${base} bg-blue-50 text-blue-600`;
    }
    return `${base} text-gray-600 hover:text-gray-900 hover:bg-gray-50`;
  };

  /**
   * Generates CSS classes for mobile navigation links based on active state.
   */
  const getMobileLinkClass = (path: string, viewParam?: string) => {
    const base = "block px-3 py-2 rounded-md text-base font-medium";
    let isActive = pathname === path;

    if (isActive && path === "/anime") {
      const currentView = searchParams?.get("view");
      if (viewParam) isActive = currentView === viewParam;
      else isActive = !currentView;
    }

    if (isActive) {
      return `${base} bg-blue-50 text-blue-600`;
    }
    return `${base} text-gray-700 hover:text-gray-900 hover:bg-gray-50`;
  };

  return (
    <nav className="sticky top-0 z-50 bg-white/90 backdrop-blur-sm border-b border-gray-100 shadow-sm">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16 items-center">
          {/* Logo */}
          <div className="flex-shrink-0 flex items-center">
            <Link href="/" className="flex items-center gap-2 group">
              <span className="text-xl">🇯🇵</span>
              <span className="font-bold text-xl tracking-tight text-gray-800 group-hover:text-blue-600 transition">
                Analyzer
              </span>
            </Link>
          </div>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-4">
            <Link href="/anime" className={getDesktopLinkClass("/anime")}>
              Browse Anime
            </Link>
            {isLoggedIn && (
              <>
                <Link
                  href="/anime?view=saved"
                  className={getDesktopLinkClass("/anime", "saved")}
                >
                  Saved Anime
                </Link>
                <Link
                  href="/saved-words"
                  className={getDesktopLinkClass("/saved-words")}
                >
                  Saved Words
                </Link>
              </>
            )}
            <Link
              href="/dictionary"
              className={getDesktopLinkClass("/dictionary")}
            >
              Dictionary
            </Link>
            <Link href="/" className={getDesktopLinkClass("/")}>
              Text Analyzer
            </Link>
          </div>

          {/* Right Side (Auth + Mobile Menu Button) */}
          <div className="flex items-center gap-4">
            {/* Auth Buttons */}
            <div className="hidden md:flex">
              {isLoggedIn ? (
                <button
                  onClick={handleLogout}
                  className="text-sm font-medium text-gray-500 hover:text-red-600 transition px-3 py-2"
                >
                  Logout
                </button>
              ) : (
                <Link
                  href="/login"
                  className="bg-gray-900 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-gray-800 transition shadow-sm"
                >
                  Log in
                </Link>
              )}
            </div>

            {/* Mobile Menu Button */}
            <div className="flex items-center md:hidden">
              {!isLoggedIn && (
                <Link
                  href="/login"
                  className="mr-4 text-sm font-bold text-gray-700"
                >
                  Log in
                </Link>
              )}

              <button
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                className="inline-flex items-center justify-center p-2 rounded-md text-gray-400 hover:text-gray-500 hover:bg-gray-100 focus:outline-none"
              >
                <span className="sr-only">Open main menu</span>
                {!isMobileMenuOpen ? (
                  <svg
                    className="block h-6 w-6"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 6h16M4 12h16M4 18h16"
                    />
                  </svg>
                ) : (
                  <svg
                    className="block h-6 w-6"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile Menu Dropdown */}
      {isMobileMenuOpen && (
        <div className="md:hidden border-t border-gray-100 bg-white">
          <div className="px-2 pt-2 pb-3 space-y-1 sm:px-3">
            <Link href="/anime" className={getMobileLinkClass("/anime")}>
              Browse Anime
            </Link>

            {isLoggedIn && (
              <>
                <Link
                  href="/anime?view=saved"
                  className={getMobileLinkClass("/anime", "saved")}
                >
                  Saved Anime
                </Link>
                <Link
                  href="/saved-words"
                  className={getMobileLinkClass("/saved-words")}
                >
                  Saved Words
                </Link>
              </>
            )}
            <Link
              href="/dictionary"
              className={getMobileLinkClass("/dictionary")}
            >
              Dictionary
            </Link>
            <Link href="/" className={getMobileLinkClass("/")}>
              Text Analyzer
            </Link>

            {/* Mobile-only Logout button */}
            {isLoggedIn && (
              <button
                onClick={handleLogout}
                className="block w-full text-left px-3 py-2 rounded-md text-base font-medium text-red-600 hover:bg-red-50"
              >
                Logout
              </button>
            )}
          </div>
        </div>
      )}
    </nav>
  );
}

/**
 * Main Navbar Component.
 * Wraps content in Suspense to support useSearchParams usage in Next.js App Router.
 */
export default function Navbar() {
  return (
    <Suspense
      fallback={
        <nav className="sticky top-0 z-50 bg-white/90 backdrop-blur-sm border-b border-gray-100 shadow-sm h-16" />
      }
    >
      <NavbarContent />
    </Suspense>
  );
}
