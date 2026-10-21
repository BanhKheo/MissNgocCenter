# Generated from D:\TanKhanh\Lecture\2026-2027\PPL\Lecture\MissNgocCenter\missngoc.dsl\grammar\ExamDSL.g4 by ANTLR 4.9.2
from antlr4 import *
if __name__ is not None and "." in __name__:
    from .ExamDSLParser import ExamDSLParser
else:
    from ExamDSLParser import ExamDSLParser

# This class defines a complete generic visitor for a parse tree produced by ExamDSLParser.

class ExamDSLVisitor(ParseTreeVisitor):

    # Visit a parse tree produced by ExamDSLParser#program.
    def visitProgram(self, ctx:ExamDSLParser.ProgramContext):
        return self.visitChildren(ctx)


    # Visit a parse tree produced by ExamDSLParser#exam.
    def visitExam(self, ctx:ExamDSLParser.ExamContext):
        return self.visitChildren(ctx)


    # Visit a parse tree produced by ExamDSLParser#questionsStmt.
    def visitQuestionsStmt(self, ctx:ExamDSLParser.QuestionsStmtContext):
        return self.visitChildren(ctx)


    # Visit a parse tree produced by ExamDSLParser#optionsStmt.
    def visitOptionsStmt(self, ctx:ExamDSLParser.OptionsStmtContext):
        return self.visitChildren(ctx)


    # Visit a parse tree produced by ExamDSLParser#maxStmt.
    def visitMaxStmt(self, ctx:ExamDSLParser.MaxStmtContext):
        return self.visitChildren(ctx)


    # Visit a parse tree produced by ExamDSLParser#versionsStmt.
    def visitVersionsStmt(self, ctx:ExamDSLParser.VersionsStmtContext):
        return self.visitChildren(ctx)


    # Visit a parse tree produced by ExamDSLParser#layoutStmt.
    def visitLayoutStmt(self, ctx:ExamDSLParser.LayoutStmtContext):
        return self.visitChildren(ctx)


    # Visit a parse tree produced by ExamDSLParser#sectionStmt.
    def visitSectionStmt(self, ctx:ExamDSLParser.SectionStmtContext):
        return self.visitChildren(ctx)


    # Visit a parse tree produced by ExamDSLParser#keyStmt.
    def visitKeyStmt(self, ctx:ExamDSLParser.KeyStmtContext):
        return self.visitChildren(ctx)


    # Visit a parse tree produced by ExamDSLParser#kind.
    def visitKind(self, ctx:ExamDSLParser.KindContext):
        return self.visitChildren(ctx)


    # Visit a parse tree produced by ExamDSLParser#sectionMod.
    def visitSectionMod(self, ctx:ExamDSLParser.SectionModContext):
        return self.visitChildren(ctx)


    # Visit a parse tree produced by ExamDSLParser#ranges.
    def visitRanges(self, ctx:ExamDSLParser.RangesContext):
        return self.visitChildren(ctx)


    # Visit a parse tree produced by ExamDSLParser#qrange.
    def visitQrange(self, ctx:ExamDSLParser.QrangeContext):
        return self.visitChildren(ctx)


    # Visit a parse tree produced by ExamDSLParser#keyEntry.
    def visitKeyEntry(self, ctx:ExamDSLParser.KeyEntryContext):
        return self.visitChildren(ctx)


    # Visit a parse tree produced by ExamDSLParser#choiceAnswer.
    def visitChoiceAnswer(self, ctx:ExamDSLParser.ChoiceAnswerContext):
        return self.visitChildren(ctx)


    # Visit a parse tree produced by ExamDSLParser#textAnswer.
    def visitTextAnswer(self, ctx:ExamDSLParser.TextAnswerContext):
        return self.visitChildren(ctx)


    # Visit a parse tree produced by ExamDSLParser#code.
    def visitCode(self, ctx:ExamDSLParser.CodeContext):
        return self.visitChildren(ctx)


    # Visit a parse tree produced by ExamDSLParser#name.
    def visitName(self, ctx:ExamDSLParser.NameContext):
        return self.visitChildren(ctx)


    # Visit a parse tree produced by ExamDSLParser#report.
    def visitReport(self, ctx:ExamDSLParser.ReportContext):
        return self.visitChildren(ctx)


    # Visit a parse tree produced by ExamDSLParser#titleStmt.
    def visitTitleStmt(self, ctx:ExamDSLParser.TitleStmtContext):
        return self.visitChildren(ctx)


    # Visit a parse tree produced by ExamDSLParser#columnsStmt.
    def visitColumnsStmt(self, ctx:ExamDSLParser.ColumnsStmtContext):
        return self.visitChildren(ctx)


    # Visit a parse tree produced by ExamDSLParser#styleStmt.
    def visitStyleStmt(self, ctx:ExamDSLParser.StyleStmtContext):
        return self.visitChildren(ctx)


    # Visit a parse tree produced by ExamDSLParser#bandStmt.
    def visitBandStmt(self, ctx:ExamDSLParser.BandStmtContext):
        return self.visitChildren(ctx)


    # Visit a parse tree produced by ExamDSLParser#style.
    def visitStyle(self, ctx:ExamDSLParser.StyleContext):
        return self.visitChildren(ctx)


    # Visit a parse tree produced by ExamDSLParser#review.
    def visitReview(self, ctx:ExamDSLParser.ReviewContext):
        return self.visitChildren(ctx)


    # Visit a parse tree produced by ExamDSLParser#flagRule.
    def visitFlagRule(self, ctx:ExamDSLParser.FlagRuleContext):
        return self.visitChildren(ctx)


    # Visit a parse tree produced by ExamDSLParser#strExpr.
    def visitStrExpr(self, ctx:ExamDSLParser.StrExprContext):
        return self.visitChildren(ctx)


    # Visit a parse tree produced by ExamDSLParser#notExpr.
    def visitNotExpr(self, ctx:ExamDSLParser.NotExprContext):
        return self.visitChildren(ctx)


    # Visit a parse tree produced by ExamDSLParser#refExpr.
    def visitRefExpr(self, ctx:ExamDSLParser.RefExprContext):
        return self.visitChildren(ctx)


    # Visit a parse tree produced by ExamDSLParser#inExpr.
    def visitInExpr(self, ctx:ExamDSLParser.InExprContext):
        return self.visitChildren(ctx)


    # Visit a parse tree produced by ExamDSLParser#orExpr.
    def visitOrExpr(self, ctx:ExamDSLParser.OrExprContext):
        return self.visitChildren(ctx)


    # Visit a parse tree produced by ExamDSLParser#kindExpr.
    def visitKindExpr(self, ctx:ExamDSLParser.KindExprContext):
        return self.visitChildren(ctx)


    # Visit a parse tree produced by ExamDSLParser#litExpr.
    def visitLitExpr(self, ctx:ExamDSLParser.LitExprContext):
        return self.visitChildren(ctx)


    # Visit a parse tree produced by ExamDSLParser#parenExpr.
    def visitParenExpr(self, ctx:ExamDSLParser.ParenExprContext):
        return self.visitChildren(ctx)


    # Visit a parse tree produced by ExamDSLParser#numExpr.
    def visitNumExpr(self, ctx:ExamDSLParser.NumExprContext):
        return self.visitChildren(ctx)


    # Visit a parse tree produced by ExamDSLParser#countExpr.
    def visitCountExpr(self, ctx:ExamDSLParser.CountExprContext):
        return self.visitChildren(ctx)


    # Visit a parse tree produced by ExamDSLParser#cmpExpr.
    def visitCmpExpr(self, ctx:ExamDSLParser.CmpExprContext):
        return self.visitChildren(ctx)


    # Visit a parse tree produced by ExamDSLParser#andExpr.
    def visitAndExpr(self, ctx:ExamDSLParser.AndExprContext):
        return self.visitChildren(ctx)


    # Visit a parse tree produced by ExamDSLParser#ref.
    def visitRef(self, ctx:ExamDSLParser.RefContext):
        return self.visitChildren(ctx)


    # Visit a parse tree produced by ExamDSLParser#field.
    def visitField(self, ctx:ExamDSLParser.FieldContext):
        return self.visitChildren(ctx)


    # Visit a parse tree produced by ExamDSLParser#number.
    def visitNumber(self, ctx:ExamDSLParser.NumberContext):
        return self.visitChildren(ctx)



del ExamDSLParser