"""Sinh AST từ parse tree (mẫu Visitor trên cây ANTLR).

Chỉ chạy khi không còn lỗi từ vựng và cú pháp, nên ở đây không phải đoán cây có thiếu nút hay không.
"""
from __future__ import annotations

from .ast_nodes import (
    Answer, Band, Binary, Count, Exam, In, Key, KeyEntry, Lit, Name, Not, Program, QRange, Ref,
    Report, Review, Rule, Section, Setting, Span, Style, StyleDecl,
)
from .generated.ExamDSLParser import ExamDSLParser
from .generated.ExamDSLVisitor import ExamDSLVisitor


def span_of(ctx) -> Span:
    start, stop = ctx.start, ctx.stop or ctx.start
    return Span(start.line, start.column + 1, stop.line, stop.column + 1 + len(stop.text or ""))


def span_tok(tok) -> Span:
    sym = tok.symbol if hasattr(tok, "symbol") else tok
    return Span(sym.line, sym.column + 1, sym.line, sym.column + 1 + len(sym.text or ""))


def unquote(text: str) -> str:
    """Bỏ dấu ngoặc kép, đổi \\" thành " và \\\\ thành \\."""
    body = text[1:-1]
    out, i = [], 0
    while i < len(body):
        if body[i] == "\\" and i + 1 < len(body):
            out.append(body[i + 1])
            i += 2
        else:
            out.append(body[i])
            i += 1
    return "".join(out)


def num(text: str) -> float:
    value = float(text)
    return int(value) if value.is_integer() and "." not in text else value


class ASTBuilder(ExamDSLVisitor):

    def visitProgram(self, ctx: ExamDSLParser.ProgramContext) -> Program:
        return Program(
            exam=self.visit(ctx.exam()),
            report=self.visit(ctx.report()) if ctx.report() else None,
            review=self.visit(ctx.review()) if ctx.review() else None,
            span=span_of(ctx),
        )

    # ───────── exam

    def visitExam(self, ctx: ExamDSLParser.ExamContext) -> Exam:
        exam = Exam(title=unquote(ctx.STRING().getText()), span=span_of(ctx))
        for stmt in ctx.examStmt():
            node = self.visit(stmt)
            if isinstance(node, Section):
                exam.sections.append(node)
            elif isinstance(node, Key):
                exam.keys.append(node)
            else:
                exam.settings.append(node)
        return exam

    def visitQuestionsStmt(self, ctx):
        return Setting(name="questions", value=int(ctx.INT().getText()), span=span_of(ctx),
                       value_spans=[span_tok(ctx.INT())])

    def visitOptionsStmt(self, ctx):
        letters = ctx.LETTER()
        return Setting(name="options", value=[t.getText() for t in letters], span=span_of(ctx),
                       value_spans=[span_tok(t) for t in letters])

    def visitMaxStmt(self, ctx):
        return Setting(name="max", value=self.visit(ctx.number()), span=span_of(ctx),
                       value_spans=[span_of(ctx.number())])

    def visitVersionsStmt(self, ctx):
        codes = ctx.code()
        return Setting(name="versions", value=[c.getText() for c in codes], span=span_of(ctx),
                       value_spans=[span_of(c) for c in codes])

    def visitLayoutStmt(self, ctx):
        return Setting(name="layout", value=unquote(ctx.STRING().getText()), span=span_of(ctx),
                       value_spans=[span_tok(ctx.STRING())])

    def visitSectionStmt(self, ctx):
        name_ctx = ctx.name()
        name = unquote(name_ctx.getText()) if name_ctx.STRING() else name_ctx.getText()
        section = Section(
            name=name,
            ranges=[self.visit(r) for r in ctx.ranges().qrange()],
            kind=ctx.kind().getText() if ctx.kind() else "choice",
            span=span_of(ctx),
            name_span=span_of(name_ctx),
        )
        mod = ctx.sectionMod()
        if mod is not None:
            value = self.visit(mod.number())
            if mod.WEIGHT():
                section.weight = value
            else:
                section.score = value
        return section

    def visitQrange(self, ctx) -> QRange:
        ints = ctx.INT()
        start = int(ints[0].getText())
        end = int(ints[1].getText()) if len(ints) > 1 else start
        return QRange(start=start, end=end, span=span_of(ctx))

    def visitKeyStmt(self, ctx) -> Key:
        code = ctx.code()
        return Key(
            version=code.getText() if code else None,
            entries=[self.visit(e) for e in ctx.keyEntry()],
            span=span_of(ctx),
            version_span=span_of(code) if code else span_tok(ctx.KEY()),
        )

    def visitKeyEntry(self, ctx) -> KeyEntry:
        return KeyEntry(qrange=self.visit(ctx.qrange()), answers=[self.visit(a) for a in ctx.answer()], span=span_of(ctx))

    def visitChoiceAnswer(self, ctx) -> Answer:
        return Answer(kind="choice", values=[t.getText() for t in ctx.LETTER()], span=span_of(ctx))

    def visitTextAnswer(self, ctx) -> Answer:
        return Answer(kind="text", values=[unquote(t.getText()) for t in ctx.STRING()], span=span_of(ctx))

    def visitNumber(self, ctx):
        return num(ctx.getText())

    # ───────── report

    def visitReport(self, ctx) -> Report:
        report = Report(span=span_of(ctx))
        for stmt in ctx.reportStmt():
            if isinstance(stmt, ExamDSLParser.TitleStmtContext):
                report.title = unquote(stmt.STRING().getText())
            elif isinstance(stmt, ExamDSLParser.ColumnsStmtContext):
                report.columns = [f.getText() for f in stmt.field()]
                report.column_spans = [span_of(f) for f in stmt.field()]
            elif isinstance(stmt, ExamDSLParser.StyleStmtContext):
                report.styles.append(StyleDecl(target=stmt.ID().getText(), style=self.visit(stmt.style()),
                                               span=span_of(stmt), target_span=span_tok(stmt.ID())))
            else:
                report.bands.append(Band(
                    label=unquote(stmt.STRING().getText()),
                    min=None if stmt.ELSE() else self.visit(stmt.number()),
                    style=self.visit(stmt.style()),
                    span=span_of(stmt),
                ))
        return report

    def visitStyle(self, ctx) -> Style:
        colors = ctx.COLOR()
        return Style(
            fill=colors[0].getText(),
            font=colors[1].getText() if len(colors) > 1 else None,
            span=span_of(ctx),
            fill_span=span_tok(colors[0]),
            font_span=span_tok(colors[1]) if len(colors) > 1 else None,
        )

    # ───────── review

    def visitReview(self, ctx) -> Review:
        return Review(rules=[self.visit(r) for r in ctx.flagRule()], span=span_of(ctx))

    def visitFlagRule(self, ctx) -> Rule:
        return Rule(message=unquote(ctx.STRING().getText()) if ctx.STRING() else None,
                    cond=self.visit(ctx.expr()), span=span_of(ctx))

    def visitParenExpr(self, ctx):
        return self.visit(ctx.expr())

    def visitCountExpr(self, ctx):
        return Count(cond=self.visit(ctx.expr()), span=span_of(ctx))

    def visitCmpExpr(self, ctx):
        return Binary(op=ctx.op.text, left=self.visit(ctx.expr(0)), right=self.visit(ctx.expr(1)), span=span_of(ctx))

    def visitInExpr(self, ctx):
        exprs = ctx.expr()
        return In(value=self.visit(exprs[0]), items=[self.visit(e) for e in exprs[1:]], span=span_of(ctx))

    def visitNotExpr(self, ctx):
        return Not(operand=self.visit(ctx.expr()), span=span_of(ctx))

    def visitAndExpr(self, ctx):
        return Binary(op="and", left=self.visit(ctx.expr(0)), right=self.visit(ctx.expr(1)), span=span_of(ctx))

    def visitOrExpr(self, ctx):
        return Binary(op="or", left=self.visit(ctx.expr(0)), right=self.visit(ctx.expr(1)), span=span_of(ctx))

    def visitRefExpr(self, ctx):
        ref = ctx.ref()
        if ref.field() is None:
            return Name(id=ref.ID().getText(), span=span_of(ctx))
        return Ref(obj=ref.ID().getText(), field=ref.field().getText(), span=span_of(ctx))

    def visitKindExpr(self, ctx):
        return Name(id=ctx.getText(), span=span_of(ctx))

    def visitNumExpr(self, ctx):
        return Lit(value=self.visit(ctx.number()), span=span_of(ctx))

    def visitStrExpr(self, ctx):
        return Lit(value=unquote(ctx.STRING().getText()), span=span_of(ctx))

    def visitLitExpr(self, ctx):
        value = {"true": True, "false": False, "none": None}[ctx.getText()]
        return Lit(value=value, span=span_of(ctx))
