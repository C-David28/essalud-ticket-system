"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Category } from "@/lib/demo-tickets";
import {
  ASSISTED_CATEGORIES,
  canRequestCategoryAssistance,
  requestCategoryAssistance,
  type CategoryAssistanceResult,
} from "@/lib/category-assistance-client";
import styles from "./category-assistance.module.css";

type AssistanceState = {
  title: string;
  description: string;
  result: CategoryAssistanceResult | "pending" | "accepted" | "dismissed";
};

export function CategoryAssistance({
  title,
  description,
  open,
  busy,
  onAccept,
}: {
  title: string;
  description: string;
  open: boolean;
  busy: boolean;
  onAccept: (category: Category) => void;
}) {
  const headingId = useId();
  const disclosureId = useId();
  const [state, setState] = useState<AssistanceState | null>(null);
  const controller = useRef<AbortController | null>(null);
  const sequence = useRef(0);
  const latestInput = useRef({ title, description, open });
  latestInput.current = { title, description, open };

  useEffect(() => {
    sequence.current += 1;
    controller.current?.abort();
    controller.current = null;
    setState(null);
    return () => {
      sequence.current += 1;
      controller.current?.abort();
      controller.current = null;
    };
  }, [title, description, open]);

  // Hide an old result immediately, before the effect cancels its request.
  const current = open && state?.title === title && state.description === description ? state.result : null;
  const pending = current === "pending";
  const validInput = canRequestCategoryAssistance(title, description);
  const suggestion = typeof current === "object" && current?.status === "suggested" ? current.suggestion : null;

  async function request() {
    if (!open || busy || pending || !validInput) return;
    controller.current?.abort();
    const requestController = new AbortController();
    controller.current = requestController;
    const requestSequence = ++sequence.current;
    const requestedTitle = title;
    const requestedDescription = description;
    const stillCurrent = () => !requestController.signal.aborted && sequence.current === requestSequence &&
      latestInput.current.open && latestInput.current.title === requestedTitle &&
      latestInput.current.description === requestedDescription;
    setState({ title, description, result: "pending" });
    try {
      const result = await requestCategoryAssistance(title, description, requestController.signal);
      if (stillCurrent()) setState({ title, description, result });
    } catch {
      if (stillCurrent()) setState({ title, description, result: { status: "unavailable", suggestion: null } });
    } finally {
      if (controller.current === requestController) controller.current = null;
    }
  }

  function accept() {
    if (!open || busy || !suggestion) return;
    onAccept(ASSISTED_CATEGORIES[suggestion.category]);
    setState({ title, description, result: "accepted" });
  }

  return (
    <section className={styles.assistance} aria-labelledby={headingId} aria-describedby={disclosureId}>
      <div className={styles.heading}>
        <Sparkles size={18} aria-hidden="true" />
        <h3 id={headingId}>Asistencia de categoría</h3>
        <span className={styles.badge}>Experimental</span>
      </div>
      <p id={disclosureId} className={styles.disclosure}>
        Modelo entrenado con datos sintéticos. Revisa la sugerencia y decide qué categoría corresponde.
      </p>
      <Button type="button" variant="outline" size="sm" onClick={() => void request()}
        disabled={!open || busy || pending || !validInput}>
        {pending ? "Consultando categoría…" : "Solicitar sugerencia"}
      </Button>
      {!validInput && <p className={styles.note}>
        Completa un título de 5 a 120 caracteres y una descripción de 10 a 2000 caracteres.
      </p>}
      <div role="status" aria-live="polite" aria-atomic="true" className={styles.result}>
        {pending && <p>Consultando la asistencia. Puedes seguir eligiendo la categoría manualmente.</p>}
        {suggestion && <>
          <p className={styles.category}>Sugerencia: <strong>{ASSISTED_CATEGORIES[suggestion.category]}</strong></p>
          <p className={styles.note}>
            Confianza no calibrada. El puntaje es un margen interno y no expresa una probabilidad.
          </p>
          <div className={styles.actions}>
            <Button type="button" size="sm" disabled={busy} onClick={accept}>Aceptar sugerencia</Button>
            <Button type="button" variant="ghost" size="sm" disabled={busy}
              onClick={() => setState({ title, description, result: "dismissed" })}>Descartar</Button>
          </div>
        </>}
        {typeof current === "object" && current?.status === "abstained" &&
          <p>No hay evidencia suficiente para sugerir una categoría. Elige la categoría manualmente.</p>}
        {typeof current === "object" && current?.status === "unavailable" &&
          <p>La asistencia no está disponible. Puedes elegir la categoría manualmente y enviar la solicitud.</p>}
        {typeof current === "object" && current?.status === "disabled" &&
          <p>La asistencia está desactivada. Elige la categoría manualmente.</p>}
        {current === "accepted" && <p>Sugerencia aceptada. Puedes cambiar la categoría antes de enviar la solicitud.</p>}
        {current === "dismissed" && <p>Sugerencia descartada. Elige la categoría manualmente.</p>}
      </div>
    </section>
  );
}
