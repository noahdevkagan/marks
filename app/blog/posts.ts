// Blog posts — content is HTML rendered via dangerouslySetInnerHTML in [slug]/page.tsx.
// Each post targets one search keyword. Keep titles under ~60 chars for SERPs.

export type Post = {
  slug: string;
  title: string;
  description: string;
  date: string;
  keyword: string;
  content: string;
};

export const AUTHOR = "Noah Kagan";

export const posts: Post[] = [
  {
    slug: "import-pocket-bookmarks",
    title: "How to Import Your Pocket Bookmarks in 2026 (Yes, Still)",
    description:
      "Pocket is gone, but if you saved your export file you can bring every bookmark, tag, and save date back. Here's how.",
    date: "2026-07-04",
    keyword: "import pocket bookmarks",
    content: `
<p>Pocket died on July 8, 2025. Mozilla gave everyone until November 12 to download their data, then deleted all of it.</p>
<p>I know people who lost ten years of saved articles because they missed one email.</p>
<p>If you were smarter than that and grabbed your export file, good news: that file is a complete backup of your reading life, and getting it into a working app takes about two minutes.</p>
<h2>First, find your export file</h2>
<p>Search your Downloads folder for <strong>ril_export.html</strong>. That's the file Pocket generated. It looks like junk if you open it, but it's actually a standard bookmarks file with every URL, title, tag, and the date you saved it.</p>
<p>Can't find it? Check your email for "Your Pocket export is ready" — the download links are dead now, but the email confirms whether you ever downloaded it. Also check old computer backups. It's worth five minutes of digging.</p>
<h2>Importing it into Marks</h2>
<p>Full disclosure: I built <a href="https://getmarks.sh">Marks</a>, so obviously I'm going to tell you to import it there. But the import genuinely handles the Pocket format properly, which most tools don't:</p>
<ol>
<li>Sign up at <a href="https://getmarks.sh">getmarks.sh</a> (free)</li>
<li>Go to Settings → Import bookmarks</li>
<li>Upload ril_export.html</li>
</ol>
<p>Your tags come through as tags. Your save dates are preserved, so your library still reads chronologically instead of showing 4,000 articles all "saved today." Most importers throw that data away. It drove me nuts, which is why I made sure ours doesn't.</p>
<h2>What if you missed the export deadline?</h2>
<p>I'll be straight with you: the data is gone. Mozilla deleted it. No support ticket will bring it back.</p>
<p>What I'd do: export your browser bookmarks (Chrome, Safari, and Firefox all export to the same HTML format, and Marks imports those too) and treat it as a fresh start. Losing an archive hurts, but most of us never reread 95% of what we save anyway. The fix is picking a tool that makes exports easy, so this never happens again.</p>
<p>That's the actual lesson from Pocket: your bookmarks should live somewhere you can walk away from.</p>
`,
  },
  {
    slug: "pocket-alternatives",
    title:
      "The Best Pocket Alternatives in 2026 (I Built One, But Here's the Honest List)",
    description:
      "A year after Pocket shut down, these are the read-later apps actually worth using — including the ones that compete with mine.",
    date: "2026-07-04",
    keyword: "pocket alternative",
    content: `
<p>When Mozilla killed Pocket in July 2025, about 20 million people needed a new home for their reading list. I was one of them, and I ended up building my own (<a href="https://getmarks.sh">Marks</a>). So yes, I'm biased. I'll flag it where it matters.</p>
<p>A year later, the dust has settled. Here's who actually deserves your bookmarks.</p>
<h2>Raindrop.io — best if you want a free organizer</h2>
<p>The most polished free option out there. Collections, tags, full-text search on the paid tier. Where it falls down is reading: it's a bookmark filing cabinet more than a reading app. If you mostly collect links and rarely read them in-app, start here.</p>
<h2>Readwise Reader — best for power readers, if you'll pay</h2>
<p>Reader does everything: articles, PDFs, newsletters, RSS, YouTube transcripts, highlighting with spaced repetition. It's also about $120/year, and the interface has the learning curve of a cockpit. Serious researchers love it. Everyone else bounces off it in a week.</p>
<h2>Instapaper — best if you want 2012 back</h2>
<p>Instapaper still works and still looks great. It's also barely changed in a decade. If all you want is a quiet place to read saved articles, that might be exactly right.</p>
<h2>Wallabag — best if you self-host</h2>
<p>Open source, runs on your own server, nobody can shut it down. The setup and the apps are rough, but "nobody can shut it down" is worth a lot after Pocket.</p>
<h2>Marks — mine</h2>
<p>I built Marks because I wanted three specific things nothing else had together: AI-suggested tags (so saving takes one click and organizing takes zero), an offline reader that archives pages so they survive link rot, and Kindle highlight sync. It's free, imports your Pocket export file with tags and dates intact, and there's a Chrome extension and iOS app.</p>
<p>If those three things sound like your list, <a href="https://getmarks.sh">try it</a>. If you want the biggest ecosystem, pick Readwise. If you want free-and-pretty, pick Raindrop.</p>
<h2>The one rule</h2>
<p>Whatever you pick: check the export button before you commit. Pocket taught us the app you love can disappear with six weeks' notice. Your reading list should be portable, always.</p>
`,
  },
  {
    slug: "instapaper-alternatives",
    title: "Instapaper Alternatives: When the Quiet Reader Isn't Enough",
    description:
      "Instapaper is still the nicest plain reader around. Here's what to use when you need search, tags, or highlights that go somewhere.",
    date: "2026-07-04",
    keyword: "instapaper alternative",
    content: `
<p>I have nothing bad to say about Instapaper's reading view. It's the best-looking place to read a saved article, full stop, and it's been that way since 2008.</p>
<p>The problem is everything around the reading view.</p>
<p>Folders instead of tags. Search that only goes deep on the paid plan. Highlights that mostly stay trapped inside the app. If you save 30 articles a year, none of this matters. If you save 30 a week, it compounds into a mess you'll never dig out of.</p>
<h2>What to switch to</h2>
<p><strong>If organization is the pain: Raindrop.io or Marks.</strong> Raindrop gives you collections and tags with a gorgeous UI. <a href="https://getmarks.sh">Marks</a> (which I built, so calibrate accordingly) goes a step further and suggests the tags for you with AI when you save — my whole library is organized and I've never once sat down to "do tagging."</p>
<p><strong>If highlights are the pain: Readwise Reader.</strong> Its whole reason for existing is getting highlights out of things and into your notes. Costs real money (~$120/year), works as advertised.</p>
<p><strong>If reading long-form on a phone is the pain: Matter.</strong> Beautiful iOS app, great text-to-speech. Weakest on desktop.</p>
<h2>What you'll give up</h2>
<p>Honestly? A bit of typographic polish. Instapaper's reader is still the prettiest. I made peace with that trade because a library I can actually search beats a slightly nicer font stack.</p>
<p>Moving is painless, by the way — Instapaper exports a standard HTML bookmarks file, and every app above imports it. Ten minutes, tags intact (in the ones that respect tags — check before you import, not after).</p>
`,
  },
  {
    slug: "raindrop-alternatives",
    title:
      "Raindrop.io Alternatives for People Who Actually Read What They Save",
    description:
      "Raindrop is a beautiful bookmark organizer with a mediocre reading experience. Here's what to use if reading is the point.",
    date: "2026-07-04",
    keyword: "raindrop alternative",
    content: `
<p>Raindrop.io is what happens when a designer builds a bookmark manager: collections look like Pinterest boards, everything animates nicely, the free tier is generous. As a place to <em>file</em> links, it's probably the best there is.</p>
<p>As a place to <em>read</em> them, it's a shrug.</p>
<p>The permanent-copy archive and full-text search sit behind the paid plan. The reader view is serviceable but nobody's favorite. Highlights exist but feel bolted on. If your saved articles pile up unread in Raindrop, the tool isn't the problem — but a tool built around reading might be the fix.</p>
<h2>Where to go</h2>
<p><strong>Readwise Reader</strong> if you're a researcher. It treats reading as the main event: highlights, notes, spaced repetition, export to Obsidian and Notion. You pay ~$120/year for the privilege and it's worth it for maybe 5% of people.</p>
<p><strong>Instapaper</strong> if you want minimalism. Save, read, done. It's the anti-Raindrop: ugly library, beautiful reading.</p>
<p><strong><a href="https://getmarks.sh">Marks</a></strong> if you want the middle: real reader view, offline archives of every page you save (free, not paywalled — this was my personal grudge with Raindrop), tags suggested by AI instead of dragged into collections by hand. I built it, so I'm the wrong person to trust for an unbiased take — but archiving-by-default is the feature I'd want you to compare directly.</p>
<h2>A note on collections vs. tags</h2>
<p>Raindrop pushes you toward folders-with-wallpaper. The problem with folders is a link about "AI in medicine" belongs in two of them. Tags solve this; nested collections just make the filing decision harder. If you leave Raindrop for any reason, let it be that.</p>
<p>Raindrop's export (Settings → Backups) produces a standard HTML file any of the above will swallow.</p>
`,
  },
  {
    slug: "readwise-reader-alternatives",
    title: "Readwise Reader Alternatives That Don't Cost $120 a Year",
    description:
      "Reader is the most capable read-later app ever made. It's also overkill for most people. Here's the honest downgrade path.",
    date: "2026-07-04",
    keyword: "readwise reader alternative",
    content: `
<p>Readwise Reader is the best read-later app ever built. I mean that. Articles, PDFs, EPUBs, newsletters, RSS, YouTube transcripts, highlights that sync to every notes app on earth. If you're doing a PhD, buy it and stop reading this post.</p>
<p>For everyone else, $119.88/year is a lot of money for "I save articles and read some of them."</p>
<p>I paid for a year. My honest usage: I saved articles, I read maybe a third, I highlighted almost never, and my "Daily Review" queue became a guilt machine. The features I actually used were maybe 10% of what I paid for.</p>
<h2>The downgrade paths</h2>
<p><strong>You use it for saving + reading → Marks or Instapaper.</strong> <a href="https://getmarks.sh">Marks</a> is free and covers the core loop: save from Chrome or iOS, clean reader view, offline archive, AI tags. (I built it — after that Readwise year, specifically.) Instapaper is the other calm option.</p>
<p><strong>You use it for Kindle highlights → Marks does this too.</strong> One click syncs every highlight from your Amazon notebook page. This was the Readwise feature I actually missed, so I built it in.</p>
<p><strong>You use it for RSS + newsletters → keep Reader, honestly.</strong> Nothing else does the everything-inbox as well. This is the use case where the price makes sense.</p>
<p><strong>You want free and don't mind assembly → Wallabag + your RSS reader of choice.</strong> Self-hosted, clunky, unkillable.</p>
<h2>The test</h2>
<p>Open your Readwise stats and look at highlights-per-month. If it's above 50, stay — you're the power user it's built for. Mine was 4. The math wasn't complicated after that.</p>
`,
  },
  {
    slug: "best-read-it-later-apps",
    title: "The Best Read-It-Later Apps in 2026, Ranked by a Bookmark Addict",
    description:
      "I've used every read-later app since Instapaper launched. Here's what's actually worth installing in 2026.",
    date: "2026-07-04",
    keyword: "best read it later app",
    content: `
<p>Credentials: I've been saving articles to read later since 2009 — Instapaper, then Pocket, then Pinboard for a decade, then a Readwise year, and eventually I got annoyed enough to build my own (<a href="https://getmarks.sh">Marks</a>). Roughly 15,000 saved links of experience. Ask me how many I've actually read.</p>
<p>Here's the 2026 field, ranked by who each app is <em>for</em>:</p>
<h2>1. Readwise Reader — the power tool</h2>
<p>Best at: everything. Worst at: being simple or cheap (~$120/yr). If reading is a core part of your job, it earns the money. Otherwise you're buying a combine harvester for a window box.</p>
<h2>2. Marks — the sweet spot (says the guy who built it)</h2>
<p>Free. One-click save, AI does the tagging, pages get archived so they still open when the original dies, Kindle highlights sync in. It's what I wanted Pocket to become and it's deliberately boring in the good way. Discount my ranking however you see fit — but the archive-by-default thing is real and nobody else does it free.</p>
<h2>3. Raindrop.io — the collector</h2>
<p>Best free tier, best-looking library. Weak reading experience. If your bookmarks are a collection more than a queue, this is your app.</p>
<h2>4. Instapaper — the monk</h2>
<p>Nothing but a beautiful reading view. Barely changed in ten years, which is either the criticism or the sales pitch depending on your personality.</p>
<h2>5. Matter — the iPhone reader</h2>
<p>Lovely iOS experience, excellent article audio. Thin everywhere that isn't an iPhone.</p>
<h2>6. Wallabag — the survivalist</h2>
<p>Self-hosted and open source. After watching Pocket delete 20 million libraries, "runs on my server" stopped sounding paranoid.</p>
<h2>The real advice</h2>
<p>Any of these beats what most people do, which is 118 open tabs and a prayer. Pick by disposition: pay for power (Reader), collect for free (Raindrop), read in silence (Instapaper), or take the free middle path (Marks). Just verify the export button exists before you move in.</p>
`,
  },
  {
    slug: "export-kindle-highlights",
    title:
      "How to Export Kindle Highlights (All 4 Ways, From Painful to One Click)",
    description:
      "Your Kindle highlights are trapped in Amazon's ecosystem. Here are four ways to get them out, including two free ones.",
    date: "2026-07-04",
    keyword: "export kindle highlights",
    content: `
<p>You've highlighted hundreds of passages across years of Kindle books, and Amazon acts like you borrowed them. Getting highlights <em>out</em> is weirdly hard by design. Four ways, worst to best:</p>
<h2>1. The clippings file (free, clunky, offline)</h2>
<p>Plug your Kindle into a computer and look for <strong>documents/My Clippings.txt</strong>. Every highlight and note you've ever made, in one text file. The catch: it's a raw dump — duplicates, weird formatting, no book organization. Fine for grep, miserable for browsing. Also only includes books read on that physical device.</p>
<h2>2. Copy-paste from the Amazon notebook (free, tedious)</h2>
<p>Go to <strong>read.amazon.com/notebook</strong>, click a book, select-all, paste somewhere. Works, preserves nothing about formatting, and you'll do it one book at a time. I did this for about six books before deciding life is short.</p>
<h2>3. Readwise (paid, polished)</h2>
<p>Readwise's original product: it slurps your Amazon notebook automatically and mails you a daily digest of old highlights. Exports to Notion, Obsidian, everything. If you want highlights as a spaced-repetition practice, this is the mature product. It's ~$120/year with Reader bundled.</p>
<h2>4. Marks (free, one click — and yes, I built it)</h2>
<p><a href="https://getmarks.sh">Marks</a> has a Kindle sync built into its Chrome extension. Click "Sync Kindle highlights," it opens your Amazon notebook page, reads every book, and pulls all highlights and notes into your bookmark library — searchable and taggable next to your saved articles. Re-sync anytime; it picks up new highlights and sorts books by most recently highlighted.</p>
<p>The reason I built it this way: your highlights and your saved articles are the same thing — stuff you wanted to remember. Keeping them in two separate apps never made sense to me.</p>
<h2>Whichever you pick</h2>
<p>Do it this week. Amazon has closed APIs before, and the notebook page has broken scrapers before. Highlights you've exported are yours; highlights in the cloud are a policy change away from gone. (Pocket users know exactly what I mean.)</p>
`,
  },
  {
    slug: "export-twitter-bookmarks",
    title: "How to Export Your X (Twitter) Bookmarks Before They Rot",
    description:
      "X bookmarks aren't in your archive download and tweets die constantly. Here's how to actually save them.",
    date: "2026-07-04",
    keyword: "export twitter bookmarks",
    content: `
<p>Here's the trap: you've been bookmarking tweets for years, you finally request your X data archive, you unzip it… and your bookmarks aren't in it. Likes are there. Bookmarks aren't. X treats them as ephemeral app state, not your data.</p>
<p>Meanwhile the tweets themselves keep dying — deleted, accounts suspended, or locked behind login walls. A bookmarked tweet is a bookmark to a coin flip.</p>
<h2>What actually works</h2>
<p><strong>Scroll-and-save (free, manual).</strong> Open your bookmarks, and for each one you care about, save it somewhere you control. Tedious but honest. Fine for under 50 bookmarks.</p>
<p><strong>Browser-automation exporters (free-ish, fragile).</strong> Various extensions will scroll your bookmarks page and scrape it to JSON or CSV. They break every time X changes its DOM, which is roughly quarterly. Check the reviews from the last month before trusting one, and expect to get URLs and text only.</p>
<p><strong>Save tweets properly as you go (my answer).</strong> I built this into <a href="https://getmarks.sh">Marks</a> because I got burned by dead tweets one time too many. With the extension, saving a tweet captures the full text, images, and thread context <em>at save time</em> — so when the tweet inevitably dies, your copy doesn't. Tweet hashtags even become tags automatically. There's also an importer for bulk-migrating an existing bookmark stash.</p>
<h2>The mindset shift</h2>
<p>Stop thinking of X bookmarks as storage. They're a to-do list with a memory leak. Anything you'd be sad to lose should live in a tool whose business model is keeping your stuff, not maximizing your scroll time. Export what you have, then change where the save button points.</p>
`,
  },
  {
    slug: "pinboard-alternatives",
    title: "Leaving Pinboard After a Decade: What I Learned and What I Use Now",
    description:
      "Pinboard was the bookmark manager for people who hated bookmark managers. A long-time user on why he left and what to switch to.",
    date: "2026-07-04",
    keyword: "pinboard alternative",
    content: `
<p>I was a Pinboard user for close to ten years and I recommended it to everyone: one-time fee, no design, no VC, just tags and speed. The tagline was "social bookmarking for introverts" and the whole product kept that promise.</p>
<p>Then the updates slowed. Then the archive feature got flaky. Then months of silence on the status page while paying customers filed support tickets into the void. Pinboard never had a shutdown moment like Pocket — it just quietly stopped being maintained while still charging for renewals.</p>
<p>Leaving something after a decade is weirdly emotional. Eleven thousand bookmarks came with me.</p>
<h2>What a Pinboard person actually needs</h2>
<p>We're a specific breed. We want tags (not folders), speed (not onboarding tours), an export button, and to be left alone. Judged on those axes:</p>
<p><strong>Raindrop.io</strong> — tags work, free tier is real, but it's visual and animated in ways that feel like being hugged by a stranger. Solid choice if that doesn't bother you.</p>
<p><strong>Wallabag / Linkding (self-hosted)</strong> — the true spiritual successors. Linkding especially is Pinboard-shaped: dense, fast, ugly-on-purpose. You do have to run a server, which is either a hobby or a chore.</p>
<p><strong><a href="https://getmarks.sh">Marks</a></strong> — the one I built, because none of the above fit. It's Pinboard's model (tags, speed, plain text, exportable) plus the two things I always wished Pinboard had done well: reliable page archiving and tags that apply themselves. The AI tagging sounds like a gimmick until you realize it's just the Pinboard tag box pre-filled correctly. Free, and imports Pinboard's export format directly — that's literally the first importer I wrote.</p>
<h2>The lesson</h2>
<p>One-person products are wonderful until the one person gets tired. I don't regret my Pinboard decade — I regret ignoring two years of warning signs because leaving felt disloyal. Your bookmarks don't owe anyone loyalty. Export early.</p>
`,
  },
  {
    slug: "best-bookmark-manager-chrome",
    title: "The Best Bookmark Manager Chrome Extensions in 2026",
    description:
      "Chrome's built-in bookmarks give up at scale. These extensions are what to use instead, compared honestly.",
    date: "2026-07-04",
    keyword: "bookmark manager chrome extension",
    content: `
<p>Chrome's bookmark manager was designed when the internet had about forty websites. Folders, no tags, search that only matches titles, and a sync that mangles everything the moment you look at it sideways. Past a few hundred bookmarks, it's a junk drawer.</p>
<p>What you want from a replacement extension: one-click save, tags, search that reads page content, and — this is the one everyone forgets — <strong>some way to know a page is already saved</strong> so you don't hoard duplicates.</p>
<h2>The contenders</h2>
<p><strong>Raindrop.io</strong> — the prettiest, best free tier, huge user base. Save dialog is a bit heavy (pick a collection, wait for the thumbnail) but everything works. Full-text search costs money.</p>
<p><strong>Toby / Workona</strong> — these are tab managers wearing bookmark costumes. Great for "my 40 open tabs are a project," wrong for "I want a permanent library."</p>
<p><strong>Chrome bookmarks + folders discipline</strong> — free, already installed, and you'll abandon the discipline by Thursday. I've watched hundreds of people try.</p>
<p><strong><a href="https://getmarks.sh">Marks</a></strong> — mine, so season to taste. One click saves; AI suggests the tags so the save dialog takes two seconds; the page itself gets archived (dead links still open); and the toolbar icon shows a checkmark on any page you've already saved, which quietly fixes the duplicate-hoarding problem. Right-click any link to save it without opening. Free.</p>
<h2>How to actually choose</h2>
<p>Save the same three pages with each one and notice which extension you stopped noticing. A bookmark manager's whole job is to cost zero attention at save time and find things instantly later. Demos can't tell you that; three days of real use can.</p>
<p>And whatever you pick, export your existing Chrome bookmarks into it (Bookmark Manager → ⋮ → Export) rather than starting from zero. Every serious tool imports that file.</p>
`,
  },
  {
    slug: "save-articles-offline",
    title:
      "How to Save Articles for Offline Reading (Flights, Trains, Dead Zones)",
    description:
      "Four reliable ways to make sure the article you saved actually opens when you have no signal.",
    date: "2026-07-04",
    keyword: "save articles offline",
    content: `
<p>Every read-later app claims offline reading. Then you're on a plane, you open the app, and half your queue shows a spinner — because the app saved the <em>link</em>, not the <em>article</em>, and planned to fetch it "later." You are now living in later.</p>
<p>Here's what actually keeps text on the device:</p>
<h2>1. A read-later app that archives at save time</h2>
<p>The clean fix is an app that grabs the full article the moment you save it, not the moment you open it. This is how I built <a href="https://getmarks.sh">Marks</a> — saving a page captures and archives it immediately, so the reader view works with zero signal and keeps working even if the original page is deleted next year. (Built it, biased, etc. But this specific behavior is the whole reason it exists.)</p>
<p>Readwise Reader and Instapaper also download properly for offline; just open the app once on wifi so it syncs before you board.</p>
<h2>2. Print to PDF</h2>
<p>The nuclear option. Cmd+P → Save as PDF. Ugly, manual, and utterly reliable — a PDF has no opinions about your connectivity. Good for the three articles you <em>must</em> have, bad as a system.</p>
<h2>3. The browser's reading list</h2>
<p>Safari's Reading List can download saved pages for offline (turn it on in settings — it's off by default). Chrome's reading list mostly doesn't, despite the identical name. Test yours in airplane mode before trusting it at 30,000 feet.</p>
<h2>4. Single-file page savers</h2>
<p>Extensions like SingleFile snapshot the entire page into one HTML file. Perfect fidelity, zero organization. It's the digital equivalent of photocopying a magazine article: works great, then lives in a drawer.</p>
<h2>The pre-flight checklist</h2>
<p>Whatever system you use: open it in airplane mode <em>at home</em>, once. Two minutes of testing beats discovering your queue is a spinner farm somewhere over Nebraska. I learned this over Nebraska.</p>
`,
  },
];

export function getPost(slug: string): Post | undefined {
  return posts.find((p) => p.slug === slug);
}
