from __future__ import annotations
import streamlit as st
from src.grounding import check_items, grounded_rate
from src.llm import LLMError, api_key_configured
from src.scoring import CATEGORIES, score_clauses
from .common import (DISCLAIMER, cite, document_id, load_showcase, read_upload_or_sample,
                     render_radar_chart, set_active_document, showcase_badge, showcase_for,
                     tracked_task, truncate)

def render() -> None:
    st.subheader("Explore the document's clause map")
    st.caption("See major clauses, risk signals, source text, and relationships.")
    doc = read_upload_or_sample("Upload a document", "up_explorer")
    if not doc: return
    set_active_document("explorer_document_id", doc); showcase = showcase_for(doc)
    if st.button("🧭 Build clause map", type="primary", disabled=not (api_key_configured() or showcase)):
        try:
            if showcase: showcase_badge(); out = showcase["clause_map"]
            else: out = tracked_task("map", f"document_text:\n{truncate(doc)}")
            clauses = check_items(out.get("clauses", []), doc); valid = {c.get("section_id") for c in clauses}
            for clause in clauses: clause["related_section_ids"] = [x for x in clause.get("related_section_ids", []) if x in valid]
            st.session_state.clause_map = {"document_id": document_id(doc), "document_type": out.get("document_type", "unknown"), "clauses": clauses}
        except LLMError as e: st.error(str(e)); return
    result = st.session_state.get("clause_map")
    if not result or result.get("document_id") != document_id(doc): return
    clauses = result["clauses"]; health = score_clauses(clauses)
    left, right = st.columns([1, 2])
    with left:
        st.metric("Contract health", f"{health['overall']}/100")
        st.caption(f"{health['high_risk_count']} high-risk clause(s) · {grounded_rate(clauses):.0%} grounded")
        for category in CATEGORIES: st.progress(health["category_scores"][category] / 100, text=f"{category}: {health['category_scores'][category]}/100")
    with right: st.write("**Risk category profile**"); render_radar_chart(health["category_scores"])
    st.write("### Signing today? Read this first")
    for risk, label in [("Low", "🟢 The Good"), ("Medium", "🟡 The Watchouts"), ("High", "🔴 The Dealbreakers")]:
        with st.expander(label):
            items = [c for c in clauses if c.get("risk_level") == risk][:3]
            for c in items: st.write(f"- **{c.get('heading', 'Clause')}** — {c.get('summary', '')[:160]}")
            if not items: st.caption("None found.")
    for clause in clauses:
        risk = clause.get("risk_level", "Medium")
        with st.container(border=True):
            st.write(f"**{clause.get('heading', 'Clause')}** · {risk} risk")
            st.write(clause.get("summary", "")); st.caption(f"Why: {clause.get('risk_reason', 'Not specified.')}")
            st.caption("✅ Grounded source span" if clause.get("grounded") else "⚠️ Source span needs review"); cite(clause.get("source_span"), doc)
            if risk == "High":
                key = f"{document_id(doc)}:{clause.get('section_id', clause.get('heading', 'clause'))}"
                if st.button("🧭 Next steps", key=f"next_{key}", disabled=not (api_key_configured() or showcase)):
                    try:
                        steps = showcase.get("next_steps_indemnity") if showcase and "indemnif" in clause.get("source_span", "").lower() else tracked_task("next_steps", f"clause_text:\n{clause.get('source_span', '')}\n\ndocument_text:\n{truncate(doc, 30_000)}")
                        st.session_state.setdefault("next_steps", {})[key] = steps
                    except LLMError as e: st.error(str(e))
                if st.session_state.get("next_steps", {}).get(key): st.write(st.session_state["next_steps"][key].get("what_it_means", ""))
    export = "# Clause map\n\n" + "\n\n".join(f"## {c.get('heading', 'Clause')} — {c.get('risk_level', 'Medium')} risk\n\n{c.get('summary', '')}\n\n> {c.get('source_span', '')}" for c in clauses)
    st.download_button("⬇️ Export clause map (Markdown)", export, "lexiclarity_clause_map.md", "text/markdown"); st.warning(DISCLAIMER)
