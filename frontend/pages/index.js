import { Fragment } from "react";
import { Global, css } from "@emotion/react";
import Link from "next/link";
import SEO from "../components/seo";
import { Box, Typography, Container } from "@mui/material";
import {
  AccountTreeOutlined,
  GroupsOutlined,
  StorageOutlined,
  TravelExploreOutlined,
} from "@mui/icons-material";

import { WORK_TYPE_ICONS } from "../components/CuratorElements/WorkTypeChooser";
import { WORK_TYPES, WORK_TYPE_KEYS } from "../Utils/workTypes";

// What Qresp does for any curated work, whatever its type.
const CAPABILITIES = [
  {
    Icon: AccountTreeOutlined,
    title: "Trace every result",
    text: "Link each figure, dataset, script and tool to the exact files that produced it, and draw the workflow that connects them.",
  },
  {
    Icon: StorageOutlined,
    title: "Data stays where it lives",
    text: "Records point to files on your research computing server or data repository. Nothing is copied or re-hosted.",
  },
  {
    Icon: TravelExploreOutlined,
    title: "Searchable everywhere",
    text: "Published records are searchable across every Qresp server, with related research suggested alongside them.",
  },
  {
    Icon: GroupsOutlined,
    title: "Share on your terms",
    text: "Publish openly, or keep a record private and invite collaborators as viewers or editors.",
  },
];

const btnStyles = css`
  /*
   * Typed custom property — enables animating a CSS length that descendant
   * clip-path can reference. inherits:true propagates the animated value
   * from .qr-btn-explore to its children on every frame.
   */
  @property --glass-y {
    syntax: '<length>';
    initial-value: 0px;
    inherits: true;
  }

  /* ── button row ──────────────────────────────────────────────────── */
  .qr-btns {
    display: flex;
    flex-direction: row;
    gap: 3.5rem;
    justify-content: center;
    flex-wrap: wrap;
    padding: 0.25rem 1rem 2.5rem;
  }

  .qr-btn {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.55rem;
    text-decoration: none;
    width: 240px;
    padding: 2rem 2rem 1.6rem;
    border-radius: 14px;
    border: 1px solid rgba(255, 255, 255, 0.13);
    background: #800000;
    box-shadow: 0 4px 22px rgba(100, 0, 0, 0.50);
    cursor: pointer;
    transition: transform 0.22s ease, box-shadow 0.22s ease;
    overflow: hidden;
  }

  .qr-btn:hover {
    transform: translateY(-5px);
    box-shadow: 0 14px 40px rgba(100, 0, 0, 0.65);
  }

  .qr-btn:focus-visible {
    outline: 3px solid rgba(255, 255, 255, 0.75);
    outline-offset: 3px;
  }

  /*
   * Fixed-height icon area (116px) — both icons are centred within it so
   * "Explore" and "Curate" always sit at the same Y position.
   */
  .qr-icon-area {
    position: relative;
    z-index: 1;
    height: 116px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .qr-btn-label {
    font-size: 1.65rem;
    font-weight: 900;
    letter-spacing: 0.16em;
    color: white;
    text-transform: uppercase;
    line-height: 1;
    white-space: nowrap;
  }

  .qr-btn-sub {
    font-size: 0.78rem;
    color: rgba(255, 255, 255, 0.52);
    letter-spacing: 0.07em;
    text-align: center;
    line-height: 1.35;
    margin-top: 0.1rem;
  }

  /* ── EXPLORE: magnifying glass + real-time zoom tracking ────────── */

  /*
   * Layout math (button-relative px):
   *   padding-top 32 + icon-area 116 (SVG centred → 1px top margin, cy=40)
   *   → lens centre in button = 32 + 1 + 40 = 73
   *   gap 0.55rem ≈ 9px → label-wrap starts at 32+116+9 = 157
   *   label height ≈26px → label centre at 170
   *   glass travels 170−73 = 97px to reach the label centre
   *
   * --glass-y is animated on .qr-btn-explore:hover (0→97px) and inherited
   * by the zoom overlay. The clip circle centre tracks it in real time:
   *   y in label-wrap coords = var(--glass-y) − 84px
   *   When glass-y=0:   y=−84 → circle fully above label → invisible ✓
   *   When glass-y=49:  y=−35 → circle bottom just grazes label top
   *   When glass-y=84:  y=  0 → circle centred on label top → half visible
   *   When glass-y=97:  y= 13 → circle centred on label → full lens ✓
   * Fixed radius 35px matches the SVG lens; no radius animation needed.
   */

  /* Set --glass-y = 0 explicitly so the transition has a declared start value */
  .qr-btn-explore {
    --glass-y: 0px;
  }

  .qr-glass-icon {
    display: block;
    transform: translateY(0px) rotate(0deg);
  }

  .qr-label-wrap {
    position: relative;
    line-height: 1;
  }

  /*
   * Zoom overlay — clip circle tracks --glass-y, filling the lens interior
   * with colour from the moment the hover starts (glass-y=0).
   *
   * Layout (button-relative px):
   *   lens centre y=73 (pad 32 + 1px margin + cy 40), lens top y=38 (r=35)
   *   label-wrap top y=157  →  extend element 119px above: top = 38px
   *   inset: -119px 0  (symmetric, height = 119+26+119 = 264px)
   *   flex centre = 132px from element top = 38+132 = 170px in button ✓
   *
   * Clip: circle(35px at 50% calc(glass-y + 35px))
   *   glass-y=0:  38+(0+35)=73px  (lens start) ✓
   *   glass-y=97: 38+(97+35)=170px (label centre) ✓
   */
  .qr-label-zoom {
    position: absolute;
    inset: -119px 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 2.9rem;
    font-weight: 900;
    letter-spacing: 0.16em;
    color: white;
    text-transform: uppercase;
    white-space: nowrap;
    pointer-events: none;
    background: rgb(138, 20, 20);
    clip-path: circle(35px at 50% calc(var(--glass-y) + 35px));
  }

  @media (prefers-reduced-motion: no-preference) {
    /*
     * CSS transitions (not animations) for smooth in AND out:
     *   --glass-y on the button transitions 0→97px hover-in, 97→0px hover-out.
     *   .qr-label-zoom inherits the live value each frame → clip tracks glass.
     *   .qr-glass-icon uses its own transform transition (same easing) so the
     *   lens and clip circle stay in lock-step in both directions.
     */
    .qr-btn-explore {
      transition: --glass-y 0.8s ease-out, transform 0.22s ease, box-shadow 0.22s ease;
    }

    .qr-btn-explore:hover {
      --glass-y: 97px;
    }

    .qr-glass-icon {
      transition: transform 0.8s ease-out;
    }

    .qr-btn-explore:hover .qr-glass-icon {
      transform: translateY(97px) rotate(-10deg);
    }
  }

  /* ── CURATE: pencil wiggles on hover ─────────────────────────────── */
  .qr-pencil-icon {
    display: block;
  }

  @media (prefers-reduced-motion: no-preference) {
    @keyframes qr-pen-wiggle {
      0%,100% { transform: rotate(0deg);  }
      30%     { transform: rotate(-8deg); }
      70%     { transform: rotate(8deg);  }
    }

    .qr-btn-curate:hover .qr-pencil-icon {
      animation: qr-pen-wiggle 0.75s ease-in-out infinite;
      transform-origin: 65% 75%;
    }
  }

  /* "DOCUMENTATION" is wide — scale it down to fit the 240px card */
  .qr-btn-docs .qr-btn-label {
    font-size: 1.25rem;
    letter-spacing: 0.1em;
  }

  /* ── DOCUMENTATION: document fans on hover ──────────────────────── */
  .qr-doc-icon { display: block; }

  @media (prefers-reduced-motion: no-preference) {
    @keyframes qr-doc-fan {
      0%,100% { transform: rotate(0deg);  }
      30%     { transform: rotate(-7deg); }
      70%     { transform: rotate(7deg);  }
    }
    .qr-btn-docs:hover .qr-doc-icon {
      animation: qr-doc-fan 0.8s ease-in-out infinite;
      transform-origin: 50% 90%;
    }
  }

  /* ── CONTACT: envelope bounces on hover ──────────────────────────── */
  .qr-mail-icon { display: block; }

  @media (prefers-reduced-motion: no-preference) {
    @keyframes qr-mail-bounce {
      0%,100% { transform: translateY(0px);  }
      40%     { transform: translateY(-9px); }
      65%     { transform: translateY(-4px); }
    }
    .qr-btn-contact:hover .qr-mail-icon {
      animation: qr-mail-bounce 0.7s ease-in-out infinite;
    }
  }

  /* ── Reduced-motion: static glow only ───────────────────────────── */
  @media (prefers-reduced-motion: reduce) {
    .qr-btn-explore:hover  .qr-btn-label,
    .qr-btn-curate:hover   .qr-btn-label,
    .qr-btn-docs:hover     .qr-btn-label,
    .qr-btn-contact:hover  .qr-btn-label {
      text-shadow: 0 0 18px rgba(255, 200, 200, 0.65);
    }
  }

  /* ── Banner logo overlay ─────────────────────────────────────────── */
  .qr-logo-overlay {
    position: absolute;
    top: 53%;
    left: 50%;
    transform: translate(-50%, -50%);
    z-index: 10;
    pointer-events: none;
  }

  .qr-logo-svg {
    width: 62vw;
    min-width: 300px;
    max-width: 760px;
    height: auto;
    pointer-events: auto;
    user-select: none;
    filter:
      drop-shadow(0 2px 18px rgba(0, 0, 0, 1))
      drop-shadow(0 6px 40px rgba(0, 0, 0, 0.85))
      drop-shadow(0 0 8px rgba(255, 255, 255, 0.18));
    transition: transform 0.4s ease, filter 0.4s ease;
  }

  .qr-logo-tagline {
    text-align: center;
    color: white;
    font-size: clamp(0.85rem, 2.5vw, 1.4rem);
    font-weight: 300;
    font-style: italic;
    letter-spacing: 0.06em;
    margin-top: 0.75rem;
    max-width: 90vw;
    white-space: nowrap;
    opacity: 0.75;
    transition: opacity 0.5s ease;
    pointer-events: none;
    user-select: none;
    text-shadow:
      0 0 40px rgba(255, 255, 255, 0.7),
      0 0 80px rgba(255, 180, 180, 0.35),
      0 3px 10px rgba(0, 0, 0, 0.95);
  }

  .qr-logo-svg:hover ~ .qr-logo-tagline {
    opacity: 1;
  }

  @media (prefers-reduced-motion: no-preference) {
    .qr-logo-svg:hover {
      transform: scale(1.07);
      filter:
        drop-shadow(0 4px 28px rgba(0, 0, 0, 1))
        drop-shadow(0 10px 60px rgba(0, 0, 0, 0.9))
        drop-shadow(0 0 22px rgba(255, 255, 255, 0.35));
    }
  }
`;

export default function Home() {
  const qrespDescription =
    "Qresp makes research reproducible: it links published papers, unpublished reports, code repositories and datasets to the data, scripts and workflows behind them, with metadata that makes them searchable and discoverable";
  const qrespAuthor = "Giulia Galli, Marco Govoni";

  return (
    <Fragment>
      <SEO title="Qresp" description={qrespDescription} author={qrespAuthor} />
      <Global styles={btnStyles} />

      <Box sx={{ display: "flex", flexDirection: "column", flexGrow: 1 }}>

        {/* ── Banner ──────────────────────────────────────────────── */}
        <div style={{ position: "relative", overflow: "hidden", maxHeight: "48vh" }}>
          <img src="/images/qresp-gif.gif" alt="Qresp Banner Blurred Background" width="100%" className="blur" />
          <img src="/images/qresp-gif.gif" alt="Qresp Banner" className="poster" />
          <div className="qr-logo-overlay">
            <svg viewBox="0 0 350 105" className="qr-logo-svg" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="Qresp" role="img">
              {/* Q — magnifying glass */}
              <circle cx="40" cy="40" r="35" stroke="white" strokeWidth="8" />
              <path d="M 17 35 Q 21 18 38 17" stroke="rgba(255,255,255,0.45)" strokeWidth="2.5" strokeLinecap="round" fill="none" />
              <path d="M 63 72 L 78 93" stroke="white" strokeWidth="10" strokeLinecap="round" fill="none" />
              {/* r — pencil vertical stem */}
              <g transform="translate(92, 51) scale(1.262)">
                <rect x="-4" y="-23" width="8" height="7" rx="2" fill="none" stroke="white" strokeWidth="2.5" />
                <line x1="-5" y1="-16" x2="5" y2="-16" stroke="rgba(255,255,255,0.50)" strokeWidth="1.5" />
                <rect x="-4" y="-16" width="8" height="25" fill="none" stroke="white" strokeWidth="2.5" />
                <polygon points="-4,9 4,9 0,19" fill="none" stroke="white" strokeWidth="2.5" strokeLinejoin="round" />
              </g>
              {/* r — shoulder arm */}
              <path d="M 97 31 C 104 22 113 22 120 31" stroke="white" strokeWidth="4" strokeLinecap="round" fill="none" />
              {/* esp */}
              <text x="122" y="75" fontFamily="'Nunito', Arial, sans-serif" fontSize="104" fontWeight="200" fill="white" style={{ userSelect: "none" }}>esp</text>
            </svg>
          <div className="qr-logo-tagline">Curation and Exploration of Reproducible Scientific Papers</div>
          </div>
        </div>

        {/* ── Intro ───────────────────────────────────────────────── */}
        <Box sx={{ py: 5, px: 3, textAlign: "center" }}>
          <Container maxWidth="sm">
            <Typography variant="h4" component="h1" gutterBottom sx={{ fontWeight: 700, letterSpacing: "-0.01em" }}>
              Open science, made reproducible.
            </Typography>
            <Typography variant="body1" sx={{ fontSize: "1.1rem", lineHeight: 1.8, color: "text.secondary" }}>
              Qresp links research to the exact data, code and workflows behind
              it. Curate a published paper, a report still in progress, a code
              repository, a dataset or anything else, so every result can be
              found, traced and reproduced.
            </Typography>
          </Container>
        </Box>

        {/* ── Section label ───────────────────────────────────────── */}
        <Typography
          variant="overline"
          align="center"
          display="block"
          sx={{ mb: 1.5, letterSpacing: "0.2em", color: "text.disabled", fontSize: "0.75rem" }}
        >
          What would you like to do?
        </Typography>

        {/* ── CTA Buttons ─────────────────────────────────────────── */}
        <div className="qr-btns">

          {/* EXPLORE ────────────────────────────────────────────── */}
          <Link href="/explorer" className="qr-btn qr-btn-explore">

            {/*
              Magnifying glass — white outline, faint interior.
              ViewBox 0 0 90 114:
                Lens   cx=45 cy=40 r=35  (centered in 90px SVG → aligns clip at 50%)
                Handle (69,64) → (85,106)  same angle as before, shifted +5x
              SVG 114px tall, centred in 116px icon-area (1px margin top).
              Lens centre: 1+40=41px from icon-area top, 73px from button top.
              translateY(97) lands the lens centre on the label centre (170px).
            */}
            <div className="qr-icon-area">
              <svg
                className="qr-glass-icon"
                viewBox="0 0 90 114"
                width="90"
                height="114"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden="true"
              >
                <circle cx="45" cy="40" r="35" fill="rgba(255,255,255,0.08)" />
                <circle cx="45" cy="40" r="35" stroke="white" strokeWidth="8" />
                <path d="M 22 35 Q 26 18 43 17" stroke="rgba(255,255,255,0.45)" strokeWidth="2.5" strokeLinecap="round" fill="none" />
                <path d="M 68 72 L 83 93" stroke="white" strokeWidth="10" strokeLinecap="round" fill="none" />
              </svg>
            </div>

            {/* Label with zoom overlay */}
            <div className="qr-label-wrap">
              <span className="qr-btn-label">Explore</span>
              {/*
                Zoom overlay: font-size 2.9rem makes the text ~1.76× bigger
                than the 1.65rem base.  background #800000 erases the normal
                text inside the lens.  clip-path circle(27px) matches the
                visual lens radius so the magnified letters are strictly
                contained within the glass.
              */}
              <span className="qr-label-zoom" aria-hidden="true">Explore</span>
            </div>

            <span className="qr-btn-sub">Browse reproducible research</span>
          </Link>

          {/* CURATE ─────────────────────────────────────────────── */}
          <Link href="/curator" className="qr-btn qr-btn-curate">

            {/*
              Pencil — white outline only, fill="none" on every shape.
              ViewBox 0 0 44 44, group translate(22,22) rotate(−45°):
                eraser cap  (-4,−23) rx=2
                ferrule     line at y=−16
                body        rect (-4,−16) to (4,9)
                wood cone   triangle to (0,19)
              The icon is centred in the 90px icon-area to match the
              Explore button's label height.
            */}
            <div className="qr-icon-area">
              <svg
                className="qr-pencil-icon"
                viewBox="0 0 44 44"
                width="80"
                height="80"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden="true"
              >
                <g transform="translate(22,22) rotate(-45)">
                  <rect
                    x="-4" y="-23" width="8" height="7" rx="2"
                    fill="none" stroke="white" strokeWidth="1.8"
                  />
                  <line
                    x1="-5" y1="-16" x2="5" y2="-16"
                    stroke="rgba(255,255,255,0.50)" strokeWidth="1.2"
                  />
                  <rect
                    x="-4" y="-16" width="8" height="25"
                    fill="none" stroke="white" strokeWidth="1.8"
                  />
                  <polygon
                    points="-4,9 4,9 0,19"
                    fill="none" stroke="white" strokeWidth="1.8"
                    strokeLinejoin="round"
                  />
                </g>
              </svg>
            </div>

            <span className="qr-btn-label">Curate</span>
            <span className="qr-btn-sub">Papers, code, data and more</span>
          </Link>

          {/* DOCUMENTATION ──────────────────────────────────────────── */}
          <Link href="/documentation" className="qr-btn qr-btn-docs">
            <div className="qr-icon-area">
              <svg className="qr-doc-icon" viewBox="0 0 44 44" width="74" height="74" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <path d="M 9 3 L 27 3 L 35 11 L 35 41 L 9 41 Z" stroke="white" strokeWidth="1.8" strokeLinejoin="round" />
                <path d="M 27 3 L 27 11 L 35 11" stroke="white" strokeWidth="1.6" strokeLinejoin="round" />
                <line x1="14" y1="18" x2="30" y2="18" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
                <line x1="14" y1="24" x2="30" y2="24" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
                <line x1="14" y1="30" x2="23" y2="30" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </div>
            <span className="qr-btn-label">Documentation</span>
            <span className="qr-btn-sub">Guides and references</span>
          </Link>

          {/* CONTACT ─────────────────────────────────────────────────── */}
          <Link href="/contact" className="qr-btn qr-btn-contact">
            <div className="qr-icon-area">
              <svg className="qr-mail-icon" viewBox="0 0 44 44" width="74" height="74" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <rect x="4" y="11" width="36" height="24" rx="2" stroke="white" strokeWidth="1.8" />
                <polyline points="4,11 22,27 40,11" stroke="white" strokeWidth="1.8" strokeLinejoin="round" />
              </svg>
            </div>
            <span className="qr-btn-label">Contact</span>
            <span className="qr-btn-sub">Get in touch</span>
          </Link>

        </div>

        {/* ── What can be curated ─────────────────────────────────── */}
        <Box component="section" aria-labelledby="qr-curate-kinds" sx={{ bgcolor: "#faf7f7", py: 6, px: 3 }}>
          <Container maxWidth="lg">
            <Typography id="qr-curate-kinds" variant="h5" component="h2" align="center" sx={{ fontWeight: 700 }}>
              What can you make reproducible?
            </Typography>
            <Typography align="center" color="text.secondary" sx={{ mt: 1, mb: 4 }}>
              Not just published papers. Pick what you are working on to start curating it.
            </Typography>
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr", md: "repeat(5, 1fr)" },
                gap: 2,
              }}
            >
              {WORK_TYPE_KEYS.map((type) => {
                const Icon = WORK_TYPE_ICONS[type];
                const { label, description } = WORK_TYPES[type];
                return (
                  <Box
                    key={type}
                    component={Link}
                    href={`/curator?type=${type}`}
                    data-testid={`home-curate-${type}`}
                    sx={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 1,
                      p: 2.5,
                      borderRadius: 3,
                      bgcolor: "background.paper",
                      border: "1px solid rgba(128,0,0,0.12)",
                      color: "text.primary",
                      textDecoration: "none",
                      transition: "transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease",
                      "&:hover": {
                        transform: "translateY(-3px)",
                        boxShadow: "0 10px 28px rgba(100,0,0,0.12)",
                        borderColor: "#800000",
                      },
                    }}
                  >
                    <Box
                      sx={{
                        width: 44,
                        height: 44,
                        borderRadius: 2,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        bgcolor: "rgba(128,0,0,0.08)",
                        color: "#800000",
                      }}
                    >
                      <Icon />
                    </Box>
                    <Typography fontWeight={700}>{label}</Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.6 }}>
                      {description}
                    </Typography>
                  </Box>
                );
              })}
            </Box>
          </Container>
        </Box>

        {/* ── What Qresp does ─────────────────────────────────────── */}
        <Box component="section" aria-labelledby="qr-capabilities" sx={{ py: 6, px: 3 }}>
          <Container maxWidth="lg">
            <Typography id="qr-capabilities" variant="h5" component="h2" align="center" sx={{ fontWeight: 700, mb: 4 }}>
              How Qresp helps
            </Typography>
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr", md: "repeat(4, 1fr)" },
                gap: 3,
              }}
            >
              {CAPABILITIES.map(({ Icon, title, text }) => (
                <Box key={title} sx={{ textAlign: "center", px: 1 }}>
                  <Icon sx={{ fontSize: 36, color: "#800000", mb: 1 }} aria-hidden="true" />
                  <Typography fontWeight={700} gutterBottom>
                    {title}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.7 }}>
                    {text}
                  </Typography>
                </Box>
              ))}
            </Box>
          </Container>
        </Box>
      </Box>
    </Fragment>
  );
}
