from __future__ import annotations

import pandas as pd
import streamlit as st

from core.security import sanitize_text
from src.grounding import check_items, grounded_rate
from src.llm import LLMError, api_key_configured
from src.scoring import CATEGORIES, score_clauses

from .common import (
    DISCLAIMER,
    cite,
    document_id,
    read_upload_or_sample,
    render_radar_chart,
    set_active_document,
    showcase_badge,
    showcase_for,
    tracked_task,
    truncate,
)


@st.fragment
def render(clauses: list[str] | None = None) -> None:
    st.subheader("🔍 Explore the document's clause map")
    st.caption("See major clauses, risk signals, source text, and relationships.")
    doc = st.session_state.get("doc_text")
    if not doc:
        doc = read_upload_or_sample("Upload a document", "up_explorer")
    if not doc:
        st.info("👈 Please upload a legal agreement or load a sample from the sidebar to explore clauses.")
        return

    set_active_document("explorer_document_id", doc)
    showcase = showcase_for(doc)
    if st.button("🧭 Build clause map", type="primary", disabled=not (api_key_configured() or showcase)):
        try:
            if showcase:
                showcase_badge()
                out = showcase["clause_map"]
            else:
                out = tracked_task("map", f"document_text:\n{truncate(doc)}")
            found_clauses = check_items(out.get("clauses", []), doc)
            valid = {c.get("section_id") for c in found_clauses}
            for clause in found_clauses:
                clause["related_section_ids"] = [x for x in clause.get("related_section_ids", []) if x in valid]
            st.session_state.clause_map = {
                "document_id": document_id(doc),
                "document_type": out.get("document_type", "unknown"),
                "clauses": found_clauses
            }
        except LLMError as e:
            st.error(sanitize_text(str(e)))
            return

    result = st.session_state.get("clause_map")
    if not result or result.get("document_id") != document_id(doc):
        return

    mapped_clauses = result["clauses"]
    health = score_clauses(mapped_clauses)
    left, right = st.columns([1, 2])
    with left:
        st.metric("Contract health", f"{health['overall']}/100")
        st.caption(f"{health['high_risk_count']} high-risk clause(s) · {grounded_rate(mapped_clauses):.0%} grounded")
        for category in CATEGORIES:
            st.progress(health["category_scores"][category] / 100, text=f"{category}: {health['category_scores'][category]}/100")
    with right:
        st.write("**Risk category profile**")
        render_radar_chart(health["category_scores"])

    # Accessible summary table for radar chart
    st.markdown("### Category Risk Breakdown")
    cat_df = pd.DataFrame([
        {"Category": cat, "Score": f"{health['category_scores'][cat]}/100"}
        for cat in CATEGORIES
    ])
    st.dataframe(cat_df, use_container_width=True)
    st.caption("Accessible text table showing score distribution across legal categories.")

    st.write("### Signing today? Read this first")
    for risk, label in [("Low", "🟢 The Good"), ("Medium", "🟡 The Watchouts"), ("High", "🔴 The Dealbreakers")]:
        with st.expander(label):
            items = [c for c in mapped_clauses if c.get("risk_level") == risk][:3]
            for c in items:
                st.write(f"- **{sanitize_text(c.get('heading', 'Clause'))}** — {sanitize_text(c.get('summary', '')[:160])}")
            if not items:
                st.caption("None found.")

    for clause in mapped_clauses:
        risk = clause.get("risk_level", "Medium")
        with st.container(border=True):
            st.write(f"**{sanitize_text(clause.get('heading', 'Clause'))}** · {risk} risk")
            st.write(sanitize_text(clause.get("summary", "")))
            st.caption(f"Why: {sanitize_text(clause.get('risk_reason', 'Not specified.'))}")
            st.caption("✅ Grounded source span" if clause.get("grounded") else "⚠️ Source span needs review")
            cite(clause.get("source_span"), doc)
            if risk == "High":
                key = f"{document_id(doc)}:{clause.get('section_id', clause.get('heading', 'clause'))}"
                if st.button("🧭 Next steps", key=f"next_{key}", disabled=not (api_key_configured() or showcase)):
                    try:
                        steps = showcase.get("next_steps_indemnity") if showcase and "indemnif" in clause.get("source_span", "").lower() else tracked_task("next_steps", f"clause_text:\n{clause.get('source_span', '')}\n\ndocument_text:\n{truncate(doc, 30_000)}")
                        st.session_state.setdefault("next_steps", {})[key] = steps
                    except LLMError as e:
                        st.error(sanitize_text(str(e)))
                if st.session_state.get("next_steps", {}).get(key):
                    st.write(sanitize_text(st.session_state["next_steps"][key].get("what_it_means", "")))

    export = "# Clause map\n\n" + "\n\n".join(f"## {c.get('heading', 'Clause')} — {c.get('risk_level', 'Medium')} risk\n\n{c.get('summary', '')}\n\n> {c.get('source_span', '')}" for c in mapped_clauses)
    st.download_button("⬇️ Export clause map (Markdown)", export, "lexiclarity_clause_map.md", "text/markdown")
    st.warning(DISCLAIMER)
