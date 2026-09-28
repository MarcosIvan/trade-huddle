# Fonts

Barlow and Barlow Condensed by The Barlow Project Authors, licensed under the
SIL Open Font License 1.1 (see `OFL.txt`). Source:
https://github.com/google/fonts/tree/main/ofl/barlow and `ofl/barlowcondensed`.

The files are subset to Latin characters and converted to WOFF2 with
[fonttools](https://github.com/fonttools/fonttools):

```
pyftsubset <font>.ttf --flavor=woff2 --layout-features='*' \
  --unicodes="U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+2000-206F,U+2074,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD"
```
