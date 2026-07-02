import svgPaths from "./svg-kn4si39m8f";
import { imgCover } from "./svg-58mld";

function Holes() {
  return (
    <div className="absolute bottom-[19px] h-[56px] left-[257px] w-[567px]" data-name="Holes">
      <svg className="absolute block inset-0 size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 567 56">
        <g id="Holes">
          <circle cx="28" cy="28" fill="var(--fill-0, #202020)" id="Ellipse 118" r="28" />
          <circle cx="539" cy="28" fill="var(--fill-0, #202020)" id="Ellipse 119" r="28" />
          <rect fill="var(--fill-0, #202020)" height="38" id="Rectangle 1518" rx="6" width="38" x="112" />
          <rect fill="var(--fill-0, #202020)" height="38" id="Rectangle 1519" rx="6" width="38" x="417" />
        </g>
      </svg>
    </div>
  );
}

function Bump() {
  return (
    <div className="absolute contents left-[173px] top-[511px]" data-name="Bump">
      <div className="absolute h-[151px] left-[173px] top-[511px] w-[735px]" data-name="Bump">
        <svg className="absolute block inset-0 size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 735 151">
          <path d={svgPaths.pa8f1480} id="Bump" stroke="var(--stroke-0, #202020)" strokeWidth="3" />
        </svg>
      </div>
      <Holes />
      <div className="-translate-x-1/2 absolute bottom-[102px] left-1/2 overflow-clip size-[36px]" data-name="Screw">
        <div className="absolute left-0 size-[36px] top-0" data-name="Subtract">
          <svg className="absolute block inset-0 size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 36 36">
            <path d={svgPaths.p1a047080} fill="var(--fill-0, #202020)" id="Subtract" />
          </svg>
        </div>
      </div>
    </div>
  );
}

function Screws() {
  return (
    <div className="absolute contents left-[27px] top-[27px]" data-name="Screws">
      <div className="absolute left-[27px] overflow-clip size-[36px] top-[27px]" data-name="Screw">
        <div className="absolute left-0 size-[36px] top-0" data-name="Subtract">
          <svg className="absolute block inset-0 size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 36 36">
            <path d={svgPaths.p1a047080} fill="var(--fill-0, #202020)" id="Subtract" />
          </svg>
        </div>
      </div>
      <div className="absolute bottom-[27px] left-[27px] overflow-clip size-[36px]" data-name="Screw">
        <div className="absolute left-0 size-[36px] top-0" data-name="Subtract">
          <svg className="absolute block inset-0 size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 36 36">
            <path d={svgPaths.p1a047080} fill="var(--fill-0, #202020)" id="Subtract" />
          </svg>
        </div>
      </div>
      <div className="absolute overflow-clip right-[27px] size-[36px] top-[27px]" data-name="Screw">
        <div className="absolute left-0 size-[36px] top-0" data-name="Subtract">
          <svg className="absolute block inset-0 size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 36 36">
            <path d={svgPaths.p1a047080} fill="var(--fill-0, #202020)" id="Subtract" />
          </svg>
        </div>
      </div>
      <div className="absolute bottom-[27px] overflow-clip right-[27px] size-[36px]" data-name="Screw">
        <div className="absolute left-0 size-[36px] top-0" data-name="Subtract">
          <svg className="absolute block inset-0 size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 36 36">
            <path d={svgPaths.p1a047080} fill="var(--fill-0, #202020)" id="Subtract" />
          </svg>
        </div>
      </div>
    </div>
  );
}

function Frame1() {
  return (
    <div className="content-stretch flex flex-col items-start relative shrink-0 w-full">
      <div className="bg-[#9c000f] h-[24px] relative shrink-0 w-full" />
      <div className="bg-[#f0ee75] h-[24px] relative shrink-0 w-full" />
      <div className="bg-[#259f6c] h-[24px] relative shrink-0 w-full" />
      <div className="bg-[#1975ff] h-[24px] relative shrink-0 w-full" />
    </div>
  );
}

function OvalsVertical() {
  return (
    <div className="relative shrink-0 size-[59px]" data-name="Ovals-vertical-1">
      <svg className="absolute block inset-0 size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 59 59">
        <g id="Ovals-vertical-1">
          <g id="Union">
            <mask fill="white" id="path-1-inside-1_14_402">
              <path d={svgPaths.p29fdb300} />
            </mask>
            <path d={svgPaths.p863b000} fill="var(--stroke-0, #202020)" mask="url(#path-1-inside-1_14_402)" />
          </g>
        </g>
      </svg>
    </div>
  );
}

function Frame2() {
  return (
    <div className="content-stretch flex h-[59px] items-start overflow-clip py-[4.917px] relative shrink-0">
      <div className="[word-break:break-word] flex flex-col font-['Futura:Bold',sans-serif] justify-center leading-[0] not-italic relative shrink-0 text-[#202020] text-[49.167px] tracking-[-2.95px] uppercase whitespace-nowrap">
        <p className="leading-none">SCRUB</p>
      </div>
    </div>
  );
}

function Stereo() {
  return (
    <div className="absolute bottom-[11.14px] flex items-center justify-center left-[22px]">
      <div className="flex-none rotate-180">
        <div className="content-stretch flex items-center relative" data-name="Stereo">
          <OvalsVertical />
          <Frame2 />
        </div>
      </div>
    </div>
  );
}

function Frame3() {
  return (
    <div className="content-stretch flex items-start pr-[2.286px] pt-[1.714px] relative shrink-0">
      <div className="[word-break:break-word] flex flex-col font-['Helvetica_Neue:Bold',sans-serif] justify-center leading-[0] not-italic relative shrink-0 text-[#202020] text-[5.83px] text-right whitespace-nowrap" style={{ fontFeatureSettings: '"ss08"' }}>
        <p className="leading-[1.13] mb-0">Longer</p>
        <p className="leading-[1.13] mb-0">Recording</p>
        <p className="leading-[1.13]">Time</p>
      </div>
    </div>
  );
}

function Frame() {
  return (
    <div className="relative shrink-0">
      <div className="content-stretch flex flex-col items-start overflow-clip pb-[5.714px] pl-[3.429px] pr-[1.143px] pt-[5.143px] relative rounded-[inherit] size-full">
        <div className="flex h-[23.429px] items-center justify-center relative shrink-0 w-[10.857px]">
          <div className="-rotate-90 flex-none">
            <div className="[word-break:break-word] flex flex-col font-['Helvetica_Neue:Medium',sans-serif] justify-center leading-[0] not-italic relative text-[#202020] text-[6.14px] text-center tracking-[-0.0614px] uppercase whitespace-nowrap">
              <p className="leading-[0.962]">M i n</p>
            </div>
          </div>
        </div>
      </div>
      <div aria-hidden className="absolute border-[0.857px] border-black border-solid inset-[-0.428px] pointer-events-none" />
    </div>
  );
}

function OvalsVertical1() {
  return (
    <div className="relative shrink-0 size-[59px]" data-name="Ovals-vertical-1">
      <svg className="absolute block inset-0 size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 59 59">
        <g id="Ovals-vertical-1">
          <g id="Union">
            <mask fill="white" id="path-1-inside-1_14_402">
              <path d={svgPaths.p29fdb300} />
            </mask>
            <path d={svgPaths.p863b000} fill="var(--stroke-0, #202020)" mask="url(#path-1-inside-1_14_402)" />
          </g>
        </g>
      </svg>
    </div>
  );
}

function Frame4() {
  return (
    <div className="content-stretch flex h-[59px] items-start overflow-clip py-[4.917px] relative shrink-0">
      <div className="[word-break:break-word] flex flex-col font-['Futura:Bold',sans-serif] justify-center leading-[0] not-italic relative shrink-0 text-[#202020] text-[49.167px] tracking-[-2.95px] uppercase whitespace-nowrap">
        <p className="leading-none">Speed</p>
      </div>
    </div>
  );
}

function Stereo1() {
  return (
    <div className="absolute bottom-[13px] content-stretch flex items-center right-[27.99px]" data-name="Stereo">
      <OvalsVertical1 />
      <Frame4 />
    </div>
  );
}

function Cover1() {
  return (
    <div className="absolute h-[426px] left-[62px] mask-alpha mask-intersect mask-no-clip mask-no-repeat mask-size-[958px_426px] overflow-clip top-[56px] w-[958px]" style={{ maskImage: `url("${imgCover}")` }} data-name="Cover">
      <div className="absolute content-stretch flex flex-col inset-[0.5px_-0.5px_-254.5px_0.5px] items-start" data-name="Rainbow">
        <div className="bg-[#202020] flex-[1_0_0] min-h-px relative w-full" />
        <Frame1 />
        <div className="bg-[#f9faf1] flex-[1_0_0] min-h-px relative w-full" />
        <div className="bg-[#f9faf1] flex-[1_0_0] min-h-px relative w-full" />
      </div>
      <Stereo />
      <div className="absolute bg-[#f9faf1] border-[#202020] border-[1.5px] border-solid h-[83px] left-[180px] overflow-clip rounded-[64px] top-[39px] w-[598px]" data-name="Label Small">
        <div className="absolute h-0 left-[46.5px] right-[46.5px] top-[62.5px]">
          <div className="absolute inset-[-1.5px_0_0_0]">
            <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 502 1.5">
              <line id="Line 27" stroke="var(--stroke-0, #9C000F)" strokeOpacity="0.56" strokeWidth="1.5" x2="502" y1="0.75" y2="0.75" />
            </svg>
          </div>
        </div>
        <div className="absolute h-0 left-[46.5px] right-[46.5px] top-[40.5px]">
          <div className="absolute inset-[-1.5px_0_0_0]">
            <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 502 1.5">
              <line id="Line 27" stroke="var(--stroke-0, #9C000F)" strokeOpacity="0.56" strokeWidth="1.5" x2="502" y1="0.75" y2="0.75" />
            </svg>
          </div>
        </div>
        <div className="-translate-x-1/2 -translate-y-1/2 [word-break:break-word] absolute flex flex-col font-['Rock_Salt:Regular',sans-serif] justify-center leading-[0] left-1/2 not-italic text-[#202020] text-[44px] text-center top-[calc(50%-0.5px)] tracking-[8.8px] whitespace-nowrap">
          <p className="leading-[1.1]">K7 rebirth v_1</p>
        </div>
      </div>
      <div className="[word-break:break-word] absolute content-stretch flex flex-col items-center leading-[0] left-[60px] not-italic text-[#f3f3f3] top-[57px] whitespace-nowrap" data-name="A Side">
        <div className="flex flex-col font-['Gatwick:Bold',sans-serif] justify-center relative shrink-0 text-[63.4px] tracking-[-2.853px]">
          <p className="leading-[0.9]">A</p>
        </div>
        <div className="flex flex-col font-['Agrandir:Text_Bold',sans-serif] justify-center relative shrink-0 text-[32.33px] text-right tracking-[-1.9398px] uppercase" style={{ fontFeatureSettings: '"ss08"' }}>
          <p className="leading-[1.13]">Side</p>
        </div>
      </div>
      <div className="-translate-x-1/2 absolute bottom-[13.41px] content-stretch flex gap-[5.714px] items-center justify-center left-[calc(50%-4.34px)] overflow-clip" data-name="Longer Recording Time">
        <Frame3 />
        <Frame />
        <div className="[word-break:break-word] flex flex-col font-['Futura:Medium',sans-serif] justify-center leading-[0] not-italic relative shrink-0 text-[#202020] text-[27.43px] whitespace-nowrap">
          <p className="leading-[normal]">90</p>
        </div>
      </div>
      <Stereo1 />
    </div>
  );
}

function Cover() {
  return (
    <div className="absolute contents left-[62px] top-[56px]" data-name="Cover">
      <Cover1 />
    </div>
  );
}

function CoverMask() {
  return (
    <div className="absolute contents left-[62px] top-[56px]" data-name="Cover Mask">
      <Cover />
    </div>
  );
}

function Container2() {
  return (
    <div className="opacity-70 relative shrink-0" data-name="Container">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col items-center relative size-full">
        <p className="[word-break:break-word] font-['VT323:Regular','Noto_Sans_Symbols2:Regular',sans-serif] leading-[27px] not-italic relative shrink-0 text-[#1a5025] text-[18px] text-center tracking-[3px] whitespace-nowrap">LOAD A TAPE ▼</p>
      </div>
    </div>
  );
}

function Container3() {
  return (
    <div className="opacity-40 relative shrink-0" data-name="Container">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col items-center relative size-full">
        <div className="[word-break:break-word] font-['Space_Mono:Regular',sans-serif] leading-[0] not-italic relative shrink-0 text-[#1a5025] text-[12px] text-center tracking-[2px] whitespace-nowrap">
          <p className="leading-[18px] mb-0">.MP3 .WAV .OGG</p>
          <p className="leading-[18px]">.M4A .AAC .FLAC</p>
        </div>
      </div>
    </div>
  );
}

function Container1() {
  return (
    <div className="relative shrink-0" data-name="Container">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col gap-[12px] items-center relative size-full">
        <p className="[word-break:break-word] font-['VT323:Regular',sans-serif] leading-[48px] not-italic relative shrink-0 text-[#1a5025] text-[32px] text-center tracking-[4px] whitespace-nowrap">NO SIGNAL</p>
        <Container2 />
        <Container3 />
      </div>
    </div>
  );
}

function Container4() {
  return <div className="absolute bg-gradient-to-b from-[rgba(255,255,255,0.03)] h-[50px] left-[2px] to-[rgba(0,0,0,0)] top-[2px] w-[218px]" data-name="Container" />;
}

function Container() {
  return (
    <div className="-translate-y-1/2 absolute h-[148px] left-[207px] right-[207px] rounded-[7px] top-1/2" data-name="Container">
      <div aria-hidden className="absolute bg-[#060e07] inset-0 pointer-events-none rounded-[7px]" />
      <div className="content-stretch flex flex-col gap-[8px] items-center justify-center overflow-clip px-[16px] py-[14px] relative rounded-[inherit] size-full">
        <Container1 />
        <Container4 />
      </div>
      <div className="absolute inset-0 pointer-events-none rounded-[inherit] shadow-[inset_0px_3px_10px_0px_rgba(0,0,0,0.8)]" />
      <div aria-hidden className="absolute border-2 border-[#0a1c0c] border-solid inset-0 pointer-events-none rounded-[7px] shadow-[0px_0px_24px_0px_rgba(51,255,122,0.04)]" />
    </div>
  );
}

function TapeControls() {
  return (
    <div className="absolute bg-[#e6e6e6] h-[178px] left-[224px] overflow-clip rounded-[88px] top-[213px] w-[634px]" data-name="Tape Controls">
      <svg className="absolute block inset-0 size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 634 178">
        <path d={svgPaths.p3c4202f0} fill="var(--fill-0, #E6E6E6)" id="BG" stroke="var(--stroke-0, #202020)" strokeWidth="3" />
      </svg>
      <div className="-translate-y-1/2 absolute right-[37px] size-[124px] top-1/2" data-name="Pencil Thingy">
        <div className="absolute left-[3px] size-[118px] top-[3px]">
          <svg className="absolute block inset-0 size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 118 118">
            <circle cx="59" cy="59" id="Ellipse 117" r="57.5" stroke="var(--stroke-0, black)" strokeWidth="3" />
          </svg>
        </div>
        <div className="absolute h-[88px] left-[18px] top-[18px] w-[87.316px]" data-name="Subtract">
          <svg className="absolute block inset-0 size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 87.3164 88">
            <path d={svgPaths.p27b5dd00} fill="var(--fill-0, #202020)" id="Subtract" />
          </svg>
        </div>
      </div>
      <div className="-translate-y-1/2 absolute left-[37px] size-[124px] top-1/2" data-name="Pencil Thingy">
        <div className="absolute left-[3px] size-[118px] top-[3px]">
          <svg className="absolute block inset-0 size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 118 118">
            <circle cx="59" cy="59" id="Ellipse 117" r="57.5" stroke="var(--stroke-0, black)" strokeWidth="3" />
          </svg>
        </div>
        <div className="absolute h-[88px] left-[18px] top-[18px] w-[87.316px]" data-name="Subtract">
          <svg className="absolute block inset-0 size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 87.3164 88">
            <path d={svgPaths.p27b5dd00} fill="var(--fill-0, #202020)" id="Subtract" />
          </svg>
        </div>
      </div>
      <Container />
    </div>
  );
}

export default function Cassette() {
  return (
    <div className="relative size-full" data-name="Cassette">
      <div className="absolute bg-[#e6e6e6] h-[656px] left-[3px] rounded-[44px] top-[3px] w-[1074px]" data-name="BG">
        <div aria-hidden className="absolute border-3 border-[#202020] border-solid inset-[-3px] pointer-events-none rounded-[47px]" />
      </div>
      <Bump />
      <Screws />
      <CoverMask />
      <div className="absolute h-[426px] left-[62px] right-[60px] top-[56px]" data-name="Cover Outline">
        <div className="absolute inset-[-0.35%_-0.16%]">
          <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 961 429">
            <path d={svgPaths.pbd08600} id="Cover Outline" stroke="var(--stroke-0, #202020)" strokeWidth="3" />
          </svg>
        </div>
      </div>
      <TapeControls />
    </div>
  );
}