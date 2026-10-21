// ExamDSL: mô tả một bài kiểm tra của MissNgoc (đề, đáp án, bảng điểm, luật duyệt).
// Sinh parser: python tools/gen_parser.py   (ANTLR 4.9.2, target Python 3)
grammar ExamDSL;

program     : exam report? review? EOF ;

// ───────── exam ─────────
exam        : EXAM STRING LBRACE examStmt* RBRACE ;
examStmt    : QUESTIONS INT                                   # questionsStmt
            | OPTIONS LETTER+                                 # optionsStmt
            | MAX number                                      # maxStmt
            | VERSIONS code+                                  # versionsStmt
            | LAYOUT STRING                                   # layoutStmt
            | SECTION name ranges kind? sectionMod?           # sectionStmt
            | KEY code? LBRACE keyEntry* RBRACE               # keyStmt
            ;
kind        : CHOICE | TEXT ;
sectionMod  : WEIGHT number | SCORE number ;
ranges      : qrange (COMMA qrange)* ;
qrange      : INT (DASH INT)? ;          // không đặt tên "range": trùng hàm của Python
keyEntry    : qrange answer+ ;
answer      : LETTER (SLASH LETTER)*                          # choiceAnswer
            | STRING (SLASH STRING)*                          # textAnswer
            ;
code        : INT | ID | LETTER ;
name        : ID | STRING ;

// ───────── report ─────────
report      : REPORT LBRACE reportStmt* RBRACE ;
reportStmt  : TITLE STRING                                    # titleStmt
            | COLUMNS field+                                  # columnsStmt   // field: cột "score" trùng từ khoá
            | STYLE ID style                                  # styleStmt
            | BAND STRING (GE number | ELSE) style            # bandStmt
            ;
style       : FILL COLOR (FONT COLOR)? ;

// ───────── review ─────────
review      : REVIEW LBRACE flagRule* RBRACE ;
flagRule    : FLAG STRING? WHEN expr ;   // không đặt tên "rule": trùng thuộc tính của runtime ANTLR
expr        : LPAREN expr RPAREN                              # parenExpr
            | COUNT LPAREN expr RPAREN                        # countExpr
            | expr op=(LT | LE | GT | GE | EQ | NE) expr      # cmpExpr
            | expr IN LBRACK expr (COMMA expr)* RBRACK        # inExpr
            | NOT expr                                        # notExpr
            | expr AND expr                                   # andExpr
            | expr OR expr                                    # orExpr
            | ref                                             # refExpr
            | (CHOICE | TEXT)                                 # kindExpr      // answer.kind == text
            | number                                          # numExpr
            | STRING                                          # strExpr
            | (TRUE | FALSE | NONE)                           # litExpr
            ;
ref         : ID (DOT field)? ;
field       : ID | CHOICE | TEXT | SCORE | SECTION ;   // từ khoá vẫn được dùng làm tên trường
number      : INT | FLOAT ;

// ───────── lexer: từ khoá phải đứng trước ID ─────────
EXAM: 'exam'; QUESTIONS: 'questions'; OPTIONS: 'options'; MAX: 'max';
VERSIONS: 'versions'; LAYOUT: 'layout'; SECTION: 'section'; KEY: 'key';
CHOICE: 'choice'; TEXT: 'text'; WEIGHT: 'weight'; SCORE: 'score';
REPORT: 'report'; TITLE: 'title'; COLUMNS: 'columns'; STYLE: 'style';
BAND: 'band'; ELSE: 'else'; FILL: 'fill'; FONT: 'font';
REVIEW: 'review'; FLAG: 'flag'; WHEN: 'when'; COUNT: 'count';
AND: 'and'; OR: 'or'; NOT: 'not'; IN: 'in';
TRUE: 'true'; FALSE: 'false'; NONE: 'none';

LE: '<='; GE: '>='; EQ: '=='; NE: '!='; LT: '<'; GT: '>';
LBRACE: '{'; RBRACE: '}'; LPAREN: '('; RPAREN: ')'; LBRACK: '['; RBRACK: ']';
COMMA: ','; DASH: '-'; SLASH: '/'; DOT: '.';

STRING  : '"' (~["\\\r\n] | '\\' .)* '"' ;
UNCLOSED_STRING : '"' (~["\\\r\n] | '\\' .)* ;   // thiếu dấu " đóng → lỗi từ vựng có vị trí
COLOR   : '#' [0-9a-fA-F]+ ;          // độ dài kiểm tra ở pha ngữ nghĩa, để báo lỗi dễ hiểu
FLOAT   : [0-9]+ '.' [0-9]+ ;
INT     : [0-9]+ ;
LETTER  : [A-E] ;                      // đứng trước ID: "A" là chữ cái lựa chọn, không phải tên
ID      : [a-zA-Z_] [a-zA-Z0-9_]* ;
COMMENT : '//' ~[\r\n]* -> skip ;
WS      : [ \t\r\n]+ -> skip ;
ERROR_CHAR : . ;                       // ký tự lạ → lỗi từ vựng có vị trí, không làm sập lexer
