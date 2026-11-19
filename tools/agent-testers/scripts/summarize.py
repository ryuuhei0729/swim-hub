"""Merges every results/<persona>/findings.json of a collected run into one
Markdown summary, most severe first, with how many personas hit each issue.

Reports that describe the same bug in other words, or in another language, are
grouped by Claude when the `claude` CLI is installed (your own login, like the
testers). Only the report titles, screens and severities are sent. Without the
CLI, or with SUMMARY_GROUPING=0, only identical titles are merged.
Usage: python3 scripts/summarize.py <collected_run_dir>"""
import json, os, re, shutil, subprocess, sys
from collections import defaultdict
from pathlib import Path

ORDER = {"blocker": 0, "major": 1, "minor": 2, "cosmetic": 3}
CLASSES = ["layout and text size", "feedback and errors", "accessibility", "translation",
           "right to left", "tablet", "system bars", "copy", "visual polish", "crash",
           "likely test artefact"]
PROMPT = """Below are bug reports from AI testers. Each tester used the same app on a
different phone, often in a different language. Group the reports that describe
the same underlying bug: same screen or element and same cause, even when the
wording or the language differs. Different elements, strings or screens are
different bugs, even when they look alike (two mistranslated labels are two bugs).
For each group, write a short English title and pick one class from this list:
{classes}.
Answer with JSON only, in this shape:
{{"groups": [{{"title": "...", "class": "...", "ids": [1, 4]}}]}}
Every report id must be in exactly one group.

Reports (id. [persona, severity, screen] title):
{reports}
"""


def load(run_dir):
    findings, scores = [], []
    for f in sorted(Path(run_dir).glob("*/results/*/findings.json")):
        try:
            data = json.loads(f.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            continue
        if isinstance(data.get("score"), (int, float)):
            scores.append(data["score"])
        for i in data.get("issues", []):
            findings.append({"id": len(findings) + 1, "persona": f.parent.name,
                             "severity": i.get("severity") or "?",
                             "title": (i.get("title") or "?").strip(),
                             "screen": (i.get("screen") or "").strip()})
    return findings, scores


def group_by_title(findings):
    groups = {}
    for f in findings:
        g = groups.setdefault(f["title"].lower(), {"title": f["title"], "class": "", "ids": []})
        g["ids"].append(f["id"])
    return list(groups.values())


def as_id(x):
    try:
        return int(x)
    except (TypeError, ValueError):
        return None


def group_with_claude(findings):
    """Groups the reports with `claude -p`. None when the CLI is missing or its answer is unusable."""
    exe = shutil.which("claude")
    if not exe or os.environ.get("SUMMARY_GROUPING", "1") == "0" or len(findings) < 2:
        return None
    reports = "\n".join(f'{f["id"]}. [{f["persona"]}, {f["severity"]}, {f["screen"]}] {f["title"]}'
                        for f in findings)
    print(f"Grouping {len(findings)} reports with Claude...", file=sys.stderr)
    try:
        out = subprocess.run([exe, "-p", "--output-format", "json",
                              "--model", os.environ.get("SUMMARY_MODEL", "sonnet")],
                             input=PROMPT.format(classes=", ".join(CLASSES), reports=reports),
                             capture_output=True, text=True, timeout=600)
        text = json.loads(out.stdout).get("result", "")
        groups = json.loads(re.search(r"\{.*\}", text, re.S).group(0))["groups"]
    except Exception as e:  # no login, usage limit, timeout, not JSON...
        print(f"Claude grouping skipped ({type(e).__name__}): identical titles only", file=sys.stderr)
        return None
    valid, seen, result = {f["id"] for f in findings}, set(), []
    for g in groups if isinstance(groups, list) else []:
        if not isinstance(g, dict):
            continue
        ids = [i for i in map(as_id, g.get("ids") or []) if i in valid and i not in seen]
        if ids:
            seen.update(ids)
            result.append({"title": str(g.get("title") or "").strip(),
                           "class": g.get("class") if g.get("class") in CLASSES else "", "ids": ids})
    if not result:
        return None
    by_id = {f["id"]: f for f in findings}
    return result + [{"title": by_id[i]["title"], "class": "", "ids": [i]} for i in sorted(valid - seen)]


def cell(s):
    return str(s).replace("|", "\\|").replace("\n", " ")


def render(findings, scores, groups, by_claude):
    by_id = {f["id"]: f for f in findings}
    rows = []
    for g in groups:
        fs = [by_id[i] for i in g["ids"]]
        rows.append({"title": g["title"] or fs[0]["title"], "class": g["class"] or "other", "reports": fs,
                     "personas": sorted({f["persona"] for f in fs}),
                     "sev": min((f["severity"] for f in fs), key=lambda s: ORDER.get(s, 9)),
                     "screens": sorted({f["screen"] for f in fs if f["screen"]})})
    rows.sort(key=lambda r: (ORDER.get(r["sev"], 9), -len(r["personas"]), r["title"].lower()))
    personas = sorted({f["persona"] for f in findings})
    lines = ["# Agent test summary", ""]
    head = f"{len(findings)} reports from {len(personas)} personas"
    if scores:
        head += f", average score {sum(scores) / len(scores):.1f}/10"
    lines.append(head + ".")
    if by_claude:
        alone = sum(len(r["personas"]) == 1 for r in rows)
        lines.append(f"Claude grouped them into {len(rows)} distinct issues: {alone} found by one persona "
                     f"only, {len(rows) - alone} by several. Open the screenshots before you trust a group.")
    elif findings:
        lines.append("Only identical titles are merged: install the claude CLI to group the reports "
                     "that describe the same bug.")
    extra = (" Class |", "---|") if by_claude else ("", "")
    lines += ["", "| Severity | Issue | Personas | Screen |" + extra[0], "|---|---|---|---|" + extra[1]]
    for r in rows:
        lines.append(f"| {r['sev']} | {cell(r['title'])} | {len(r['personas'])} ({', '.join(r['personas'])}) "
                     f"| {cell(', '.join(r['screens']))} |" + (f" {r['class']} |" if by_claude else ""))
    if by_claude:
        classes = defaultdict(lambda: [0, set()])
        for r in rows:
            classes[r["class"]][0] += 1
            classes[r["class"]][1].update(r["personas"])
        lines += ["", "## Which personas found each class of issue", "",
                  "| Class | Issues | Personas |", "|---|---|---|"]
        for name, (n, ps) in sorted(classes.items(), key=lambda kv: (-len(kv[1][1]), kv[0])):
            lines.append(f"| {name} | {n} | {len(ps)} ({', '.join(sorted(ps))}) |")
        merged = [r for r in rows if len(r["reports"]) > 1]
        if merged:
            lines += ["", "## Reports behind each grouped issue", ""]
            for r in merged:
                lines.append(f"- **{cell(r['title'])}**")
                lines += [f"  - {f['persona']} ({f['severity']}): {f['title']}" for f in r["reports"]]
    return "\n".join(lines) + "\n"


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    findings, scores = load(sys.argv[1])
    groups = group_with_claude(findings)
    print(render(findings, scores, groups or group_by_title(findings), groups is not None), end="")


if __name__ == "__main__":
    main()
