import SwiftUI

struct BookmarkRowView: View {
    let bookmark: Bookmark

    private static let typeIcons: [String: String] = [
        "tweet": "bubble.left",
        "video": "play.rectangle",
        "image": "photo",
        "pdf": "doc.text",
        "product": "cart",
    ]

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            // Favicon
            AsyncImage(url: URL(string: "https://www.google.com/s2/favicons?sz=64&domain=\(bookmark.hostname)")) { image in
                image.resizable()
            } placeholder: {
                Image(systemName: "globe")
                    .foregroundStyle(.secondary)
            }
            .frame(width: 20, height: 20)
            .clipShape(RoundedRectangle(cornerRadius: 4))
            .padding(.top, 2)

            VStack(alignment: .leading, spacing: 4) {
                // Title
                HStack(spacing: 6) {
                    if !bookmark.isRead {
                        Circle()
                            .fill(Color.accentColor)
                            .frame(width: 7, height: 7)
                    }
                    Text(bookmark.title.isEmpty ? bookmark.url : bookmark.title)
                        .font(.subheadline.weight(.medium))
                        .lineLimit(2)
                }

                // Hostname + type + date
                HStack(spacing: 6) {
                    if let type = bookmark.type,
                       type != "article",
                       let icon = Self.typeIcons[type] {
                        Image(systemName: icon)
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                    Text(bookmark.hostname)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Text("·")
                        .font(.caption)
                        .foregroundStyle(.quaternary)
                    Text(bookmark.relativeDate)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                // Tags
                if !bookmark.tags.isEmpty {
                    FlowLayout(spacing: 4) {
                        ForEach(bookmark.tags, id: \.self) { tag in
                            Text(tag)
                                .font(.caption2.weight(.medium))
                                .padding(.horizontal, 8)
                                .padding(.vertical, 3)
                                .background(Color(.systemGray6))
                                .clipShape(Capsule())
                        }
                    }
                }

                // Offline indicator
                if bookmark.cachedContent != nil {
                    HStack(spacing: 4) {
                        Image(systemName: "arrow.down.circle.fill")
                            .font(.caption2)
                        Text("Offline")
                            .font(.caption2)
                    }
                    .foregroundStyle(.green)
                }
            }
        }
        .padding(.vertical, 4)
    }
}

// Simple flow layout for tags
struct FlowLayout: Layout {
    var spacing: CGFloat = 4

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let result = computeLayout(proposal: proposal, subviews: subviews)
        return result.size
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let result = computeLayout(proposal: proposal, subviews: subviews)
        for (index, origin) in result.origins.enumerated() {
            subviews[index].place(at: CGPoint(x: bounds.minX + origin.x, y: bounds.minY + origin.y), proposal: .unspecified)
        }
    }

    private func computeLayout(proposal: ProposedViewSize, subviews: Subviews) -> (size: CGSize, origins: [CGPoint]) {
        let maxWidth = proposal.width ?? .infinity
        var origins: [CGPoint] = []
        var x: CGFloat = 0
        var y: CGFloat = 0
        var rowHeight: CGFloat = 0

        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if x + size.width > maxWidth, x > 0 {
                x = 0
                y += rowHeight + spacing
                rowHeight = 0
            }
            origins.append(CGPoint(x: x, y: y))
            rowHeight = max(rowHeight, size.height)
            x += size.width + spacing
        }

        return (CGSize(width: maxWidth, height: y + rowHeight), origins)
    }
}
