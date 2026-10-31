// Small compatibility layer so the original screens keep their navigation calls,
// backed entirely by TanStack Router.
import { Children, isValidElement, type AnchorHTMLAttributes, type ComponentType, type ReactElement, type ReactNode } from "react";
import { useRouter, useRouterState } from "@tanstack/react-router";

export function useLocation(): [string, (to: string, opts?: { replace?: boolean }) => void] {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const router = useRouter();
  const navigate = (to: string, opts?: { replace?: boolean }) => {
    void router.navigate({ to: to as never, replace: opts?.replace });
  };
  return [pathname, navigate];
}

export function Link({ href, to, onClick, children, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { href?: string; to?: string }) {
  const [, navigate] = useLocation();
  const target = href ?? to ?? "/";
  return (
    <a
      {...rest}
      href={target}
      onClick={(e) => {
        onClick?.(e);
        if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.button !== 0) return;
        e.preventDefault();
        navigate(target);
      }}
    >
      {children}
    </a>
  );
}

type RouteProps = { path?: string; component?: ComponentType<any>; children?: ReactNode };

export function Route({ component: C, children }: RouteProps) {
  return C ? <C /> : <>{children}</>;
}

export function Switch({ children }: { children: ReactNode }) {
  const [pathname] = useLocation();
  const clean = pathname.replace(/\/+$/, "") || "/";
  let match: ReactElement | null = null;
  Children.forEach(children, (child) => {
    if (match || !isValidElement(child)) return;
    const path = (child.props as RouteProps).path;
    if (path === undefined || path === clean) match = child;
  });
  return match;
}

export function Router({ children }: { base?: string; children: ReactNode }) {
  return <>{children}</>;
}
