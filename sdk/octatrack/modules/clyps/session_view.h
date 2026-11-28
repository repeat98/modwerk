/* SPDX-License-Identifier: GPL-3.0-or-later
 * Aligned 8-pixel bands on the column-major MKII draw surface.
 * Three-column, five-pixel glyphs with a one-pixel advance gap.
 */
static const unsigned char glyphs[][3] = {
    {31,17,31},{18,31,16},{29,21,23},{21,21,31},{7,4,31},
    {23,21,29},{31,21,29},{1,1,31},{31,21,31},{23,21,31},
    {30,5,30},{31,21,10},{14,17,17},{31,17,14},{31,21,17},
    {31,5,1},{14,17,29},{31,4,31},{17,31,17},{8,16,15},
    {31,4,27},{31,16,16},{31,2,31},{31,1,30},{14,17,14},
    {31,5,2},{14,25,30},{31,5,26},{18,21,9},{1,31,1},
    {15,16,15},{7,24,7},{31,8,31},{27,4,27},{3,28,3},
    {25,21,19},{4,4,4},{0,0,0}
};

static void label(unsigned char *frame, unsigned x, unsigned band, const char *s)
{
    for (; *s && x <= 125; ++s, x += 4) {
        unsigned c = (unsigned char)*s;
        unsigned index = c >= '0' && c <= '9' ? c-'0' :
                         c >= 'A' && c <= 'Z' ? 10+c-'A' : c=='-' ? 36 : 37;
        for (unsigned i = 0; i < 3; ++i)
            frame[(x+i)*8 + 7-band] |= glyphs[index][i] << 1;
    }
}

static void number(unsigned char *frame, unsigned x, unsigned band, unsigned n)
{
    char pair[3] = {'0'+(n>=10), '0'+(n>=10 ? n-10 : n), 0};
    label(frame,x,band,pair);
}

static unsigned source(uint32_t refs, unsigned lane)
{
    return (refs >> (4*lane)) & 15u;
}

/* Five columns, seven pixels high for the Zoom cell labels. */
static const unsigned char large[][5] = {
    {62,65,73,65,62},{0,66,127,64,0},{98,81,73,73,70},{34,65,73,73,54},
    {24,20,18,127,16},{39,69,69,69,57},{60,74,73,73,48},{1,113,9,5,3},
    {54,73,73,73,54},{6,73,73,41,30},{126,9,9,9,126},{8,8,8,8,8}
};

static void zoom_source(unsigned char *frame, unsigned x, unsigned band, unsigned n)
{
    unsigned chars[3] = {10, n>=10, n>=10 ? n-10 : n};
    for (unsigned c=0; c<3; ++c)
        for (unsigned i=0; i<5; ++i)
            frame[(x+6*c+i)*8+7-band] |= large[n ? chars[c] : 11][i];
}

static void session_draw(unsigned char *frame)
{
    /* One snapshot for all four rows and both status strips. */
    unsigned sr = critical();
    uint32_t active = playing, next = requested;
    unsigned last = last_row, queued = pending_row;
    restore(sr);
#ifndef CLYPS_PERFORMANCE
    /* Show a row only while its complete current definition matches. */
    if (last && (!(defined & (1u << (last-1))) || rows[last-1] != active))
        last = 0;
#endif
    /* Paint the whole surface by contiguous columns. The row separators
     * are already present when a cell is drawn. Only invert the focus. */
    for (unsigned x=0; x<128; ++x) {
        unsigned char *column = frame+8*x;
        column[0] = column[1] = column[7] = 0;
        column[6] = 0x80;
        unsigned char rule = x >= 8 ? 0x80 : 0;
        column[2] = column[3] = column[4] = column[5] = rule;
    }
    label(frame,0,0,"CLYPS");
    label(frame,23,0,editing ? "EDIT" : row_view ? "ROW" : "CLIP");
    label(frame,42,0,"R");
    number(frame,46,0,slot+1);
    label(frame,56,0,"T");
    number(frame,60,0,track+1);
    label(frame,71,0,"L");
    if (last) number(frame,75,0,last); else label(frame,75,0,"--");
    if (refused || !supported()) label(frame,87,0,"GRID LOCK");
    else if (missing) label(frame,87,0,"NO ROW");
    else if (editing) { label(frame,87,0,"SET A"); number(frame,107,0,draft+1); }
    else if (armed) label(frame,87,0,"STORE");
    else if (queued) { label(frame,87,0,"Q ROW"); number(frame,109,0,queued); }
    else if (active || next) label(frame,87,0,"EDIT LOCK");

    label(frame,0,1,"R");
    for (unsigned r=0; r<4; ++r)
        number(frame,0,2+r,first_row+r+1);
    label(frame,0,6,RUNNING ? "P" : "S");
    label(frame,0,7,"Q");
    unsigned count=zoom ? 4 : 8, width=zoom ? 30 : 15;
    unsigned start=zoom ? (track & 4u) : 0;
    for (unsigned col=0; col<count; ++col) {
        unsigned t=start+col, left=8+width*col, x=left+(zoom ? 11 : 4);
        char name[3]={'T','1'+t,0};
        label(frame,x,1,name);
        for (unsigned r=0; r<4; ++r) {
            unsigned row=first_row+r, band=2+r;
            unsigned n=(defined & (1u<<row)) ? 1+source(rows[row],t) : 0;
            if (zoom) zoom_source(frame,left+7,band,n);
            else if (n) number(frame,x,band,n); else label(frame,x,band,"--");
            frame[left*8+7-band] = 0xff;
            if (row==slot && t==track)
                for (unsigned dx=1; dx<width; ++dx)
                    frame[(left+dx)*8+7-band] ^= 0x7f;
        }
        number(frame,x,6,1+source(active,t));
        if (source(next,t)!=source(active,t) || queued) number(frame,x,7,1+source(next,t));
        else label(frame,x,7,"--");
    }
}


/* Preserve the outer stock bands. The four-row list scrolls in groups of
 * four, with distinct focus, playing and queued indications. */
static void src_draw(unsigned char *frame)
{
    unsigned sr = critical();
    unsigned active = source(playing, track);
    unsigned next = source(requested, track);
    unsigned row_queued = pending_row;
    restore(sr);
    for (unsigned x = 0; x < 128; ++x)
        for (unsigned band = 1; band <= 6; ++band)
            frame[x*8 + 7-band] = 0;
    label(frame, 2, 1, "T");
    number(frame, 6, 1, track+1);
    label(frame, 22, 1, "SOURCE");
    for (unsigned line = 0; line < 4; ++line) {
        unsigned ref = (src_cursor & ~3u) + line;
        unsigned band = line+2;
        label(frame, 4, band, "A");
        number(frame, 8, band, ref+1);
        if (ref == active) label(frame, 32, band, RUNNING ? "PLAY" : "SET");
        if (ref == next && (next != active || row_queued)) label(frame, 70, band, "QUEUED");
        if (ref == src_cursor)
            for (unsigned x = 0; x < 22; ++x) frame[x*8 + 7-band] ^= 0x7f;
    }
    label(frame, 2, 6, "LEVEL SELECT  YES LAUNCH");
}
