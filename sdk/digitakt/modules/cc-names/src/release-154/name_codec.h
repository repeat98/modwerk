/* Experimental kit-tail format. Five native characters x 64 CC slots,
 * packed into 240 bytes; 16-byte header. No vendor code/data included. */
static const char name_alphabet[]="ABCDEFGHIJKLMNOPQRSTUVWXYZ\305\304\326\334\337\306\330\307\3210123456789~!@#$%^&()_+-= ";
static u32 crc(const u8 *p,u32 n) {
 u32 c=0xffffffff,i;
 while(n--){c^=*p++;for(i=0;i<8;i++)c=(c>>1)^(0xedb88320&-(c&1));}
 return ~c;
}
u32 pack_names(u8 *dst,const char src[8][8][6]) {
 u8 data[240];u32 i,j,b,code,bit=0;char ch;
 for(i=0;i<240;i++)data[i]=0;
 for(i=0;i<64;i++)for(j=0;j<5;j++) {
  ch=src[i/8][i%8][j];code=0;
  if(ch){for(code=1;code<=sizeof(name_alphabet)-1;code++)if(name_alphabet[code-1]==ch)break;
   if(code==sizeof(name_alphabet))return 0;}
  for(b=0;b<6;b++,bit++)data[bit/8]|=((code>>(5-b))&1)<<(7-bit%8);
 }
 R32(dst)=0x43434e31;R32(dst+4)=1;R32(dst+8)=240;R32(dst+12)=crc(data,240);
 for(i=0;i<240;i++)dst[16+i]=data[i];
 return 1;
}
u32 unpack_names(char dst[8][8][6],const u8 *src) {
 u32 i,j,b,code,bit=0;char temp[8][8][6];
 if(R32(src)!=0x43434e31||R32(src+4)!=1||R32(src+8)!=240||R32(src+12)!=crc(src+16,240))return 0;
 for(i=0;i<64;i++) {
  for(j=0;j<5;j++) {
   for(code=b=0;b<6;b++,bit++)code=(code<<1)|((src[16+bit/8]>>(7-bit%8))&1);
   if(code>sizeof(name_alphabet)-1)return 0;
   temp[i/8][i%8][j]=code?name_alphabet[code-1]:0;
  }
  temp[i/8][i%8][5]=0;
 }
 for(i=0;i<sizeof(temp);i++)((u8 *)dst)[i]=((u8 *)temp)[i];
 return 1;
}
