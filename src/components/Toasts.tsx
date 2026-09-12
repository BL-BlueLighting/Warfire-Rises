import React from "react";
import { useStore } from "../game/store";

const Toasts: React.FC = () => {
  const { ui } = useStore();
  if (ui.toasts.length === 0) return null;

  return (
    <div className="toasts">
      {ui.toasts.map((toast) => (
        <div className={`toast toast--${toast.kind}`} key={toast.id}>
          {toast.message}
        </div>
      ))}
    </div>
  );
};

export default Toasts;
