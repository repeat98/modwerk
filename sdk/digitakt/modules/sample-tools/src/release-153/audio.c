/* SPDX-License-Identifier: GPL-2.0-or-later */
#include "audio.h"
uint32_t se_pcm_valid(uint32_t source,uint32_t frames) {
 /* Mk1 has 128 MiB, repeated at 0x48000000. Native file samples use
  * the uncached alias above that address; heap-backed RAM takes use the
  * cached view. Validate within either view, keeping the original pointer
  * for reads and playback identity (no cache-coherency-changing conversion).
  * Subtract before comparing so malformed lengths cannot overflow. */
 return source>=0x40000000UL&&source<0x50000000UL&&!(source&1)&&frames>=144&&
        frames<=(0x08000000UL-(source&0x07ffffffUL))/2;
}
/* Prefer the quieter member of a crossing pair. End markers are exclusive,
 * hence their corresponding audible sample is position-1. */
static int crossing(const int16_t *x,uint32_t n,uint32_t p,uint32_t end) {
 uint32_t i=end?p-1:p;int32_t a,b;
 if(p>=n+end || (end&&!p))return 0;
 a=x[i];if(!a)return 1;
 if(i+1<n){b=x[i+1];if((a<0)!=(b<0) && (a<0?-a:a)<=(b<0?-b:b))return 1;}
 if(i){b=x[i-1];if((a<0)!=(b<0) && (a<0?-a:a)<(b<0?-b:b))return 1;}
 return 0;
}
uint32_t se_snap(const int16_t *x,uint32_t n,uint32_t p,int32_t direction,
                 uint32_t lo,uint32_t hi,uint32_t radius,uint32_t end) {
 uint32_t d,q;
 if(!x||!n||lo>hi||hi>n||p<lo||p>hi)return p;
 /* direction=0 includes the current point, +/-1 explicitly seek another. */
 if(!direction&&crossing(x,n,p,end))return p;
 for(d=1;d<=radius;d++){
  if(direction>=0&&d<=hi-p){q=p+d;if(crossing(x,n,q,end))return q;}
  if(direction<=0&&d<=p-lo){q=p-d;if(crossing(x,n,q,end))return q;}
  if(d>=hi-p&&d>=p-lo)break;
 }
 return p;
}
int16_t se_blend(int16_t tail,int16_t head,uint32_t i,uint32_t n) {
 /* Linear gains sum to one: correlated material cannot get louder.
  * n<=9600 keeps the signed 32-bit weighted sum safely bounded. */
 int32_t den=(int32_t)n-1;
 if(n<2||n>9600||i>=n)return tail;
 return (int16_t)(((int32_t)tail*(den-(int32_t)i)+(int32_t)head*(int32_t)i)/den);
}
uint32_t se_crossfade(int16_t *x,uint32_t a,uint32_t b,uint32_t n) {
 uint32_t i;
 if(!x||a>=b||n<2||n>9600||n>(b-a)/2)return a;
 for(i=0;i<n;i++)x[b-n+i]=se_blend(x[b-n+i],x[a+i],i,n);
 /* Overlap-add consumes the head once. The new loop is [a+n,b). */
 return a+n;
}
