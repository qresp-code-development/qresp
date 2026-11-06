// The documentation's table of contents — the ONE ordering of its pages.
//
// The sidebar, the mobile contents list and the previous/next links at the
// foot of every page are all derived from this list, so a page added here
// appears in all three and in the right place, and a page that is not here
// appears in none of them.
//
// The content is the reference documentation published at qresp.org, brought
// into the app so it can be read alongside the tool it describes.

export const DOCS_NAV = [
  {
    group: "Getting started",
    pages: [
      { href: "/documentation", title: "Overview" },
      { href: "/documentation/about", title: "About Qresp" },
      { href: "/documentation/curation-and-exploration", title: "Curation & Exploration" },
      { href: "/documentation/download", title: "Download" },
    ],
  },
  {
    group: "Installation",
    pages: [
      { href: "/documentation/installation", title: "Installation overview" },
      { href: "/documentation/installation/qresp", title: "Qresp" },
      { href: "/documentation/installation/qresp-organizer", title: "Qresp Organizer" },
    ],
  },
  {
    group: "Tutorial",
    pages: [
      { href: "/documentation/tutorial", title: "Tutorial overview" },
      { href: "/documentation/tutorial/data-organization", title: "Data Organization" },
      { href: "/documentation/folder-standard", title: "Qresp Folder Standard v1" },
      { href: "/documentation/tutorial/curation", title: "Metadata Generation (Curation)" },
      { href: "/documentation/tutorial/metadata-collection", title: "Metadata Collection" },
      { href: "/documentation/tutorial/exploration", title: "Paper Exploration" },
    ],
  },
  {
    group: "Reference",
    pages: [{ href: "/documentation/reference", title: "Citing, Collaborations & Contribution" }],
  },
];

export const DOCS_PAGES = DOCS_NAV.flatMap((section) =>
  section.pages.map((page) => ({ ...page, group: section.group }))
);

export const neighbours = (href) => {
  const index = DOCS_PAGES.findIndex((page) => page.href === href);
  if (index === -1) return { previous: null, next: null };
  return {
    previous: index > 0 ? DOCS_PAGES[index - 1] : null,
    next: index < DOCS_PAGES.length - 1 ? DOCS_PAGES[index + 1] : null,
  };
};
