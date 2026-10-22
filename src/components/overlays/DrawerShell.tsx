"use client";

import type { ReactNode } from "react";
import { useAppDispatch } from "@/store/hooks";
import { drawerClosed } from "@/store/slices/uiSlice";
import { Button } from "../ui/primitives";
import s from "./overlays.module.css";

interface DrawerShellProps {
  title: string;
  meta?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}

/** Side panel frame shared by the job view and every counter view. */
export function DrawerShell({ title, meta, footer, children }: DrawerShellProps) {
  const dispatch = useAppDispatch();
  return (
    <aside className={s.drawer} role="dialog" aria-modal="false" aria-label={title}>
      <div className={s.drawerHead}>
        <h2 className={s.drawerTitle}>{title}</h2>
        {meta}
        <Button variant="ghost" iconOnly icon="x" label="Close (Esc)" onClick={() => dispatch(drawerClosed())} />
      </div>
      <div className={s.drawerBody}>{children}</div>
      {footer && <div className={s.drawerFoot}>{footer}</div>}
    </aside>
  );
}
