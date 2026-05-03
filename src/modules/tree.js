import * as d3Hierarchy from 'd3-hierarchy'
import * as d3 from 'd3-selection'
import * as d3Zoom from 'd3-zoom'

let svg, g, zoom
let currentTransform = d3Zoom.zoomIdentity
let isVertical = false
let onNodeClick = null

const NW = 180
const NH = 60
const SNH = 45
const SIBLING_GAP = 70
const GENERATION_GAP = 140

export function initTree(svgId, cb) {
    onNodeClick = cb
    svg = d3.select('#' + svgId)
    g = svg.append('g').attr('class', 'tree-group')
    zoom = d3Zoom.zoom().scaleExtent([0.1, 4]).on('zoom', function (ev) { currentTransform = ev.transform; g.attr('transform', ev.transform) })
    svg.call(zoom)
    svg.on('dblclick.zoom', function () { resetZoom() })
}

export function renderTree(treeRoots) {
    if (!svg || !g) return
    var emptyState = document.getElementById('empty-state')
    if (!treeRoots || treeRoots.length === 0) { if (emptyState) emptyState.classList.remove('hidden'); g.selectAll('*').remove(); return }
    if (emptyState) emptyState.classList.add('hidden')

    var rns = treeRoots.map(function (r) { var n = Object.assign({}, r); if (!n.children) n.children = []; return n })
    var root
    if (rns.length === 1) root = d3Hierarchy.hierarchy(rns[0])
    else root = d3Hierarchy.hierarchy({ id: '__vr__', name: '', children: rns, _isVirtual: true })

    var tl = d3Hierarchy.tree()
    var nc = countNodes(root)
    var sf = Math.max(1, Math.min(2, nc / 20))
    tl.nodeSize([NH + SIBLING_GAP, (NW + GENERATION_GAP) * sf])
    root = tl(root)

    var layout = makeSpouseAwareLayout(root, (NW + GENERATION_GAP) * sf)
    var nodes = root.descendants()
    var links = root.links()
    var visibleLinks = links.filter(function (d) { return !d.target.data._isSpouse && !d.source.data._isSpouse })
    var coupleChildLinks = links.filter(function (d) { return d.source.data._isSpouse && !d.target.data._isSpouse && d.source.parent })

    g.selectAll('.link-group').data([null]).join('g').attr('class', 'link-group')
        .selectAll('path.link').data(visibleLinks).join('path').attr('class', 'link')
        .attr('fill', 'none').attr('stroke', '#475569').attr('stroke-width', 2)
        .attr('d', function (d) { return isVertical ? makeDiagV(d, layout.coords) : makeDiagH(d, layout.coords) })

    g.selectAll('.couple-child-link-group').data([null]).join('g').attr('class', 'couple-child-link-group')
        .selectAll('path.couple-child-link').data(coupleChildLinks).join('path').attr('class', 'link couple-child-link')
        .attr('fill', 'none').attr('stroke', '#475569').attr('stroke-width', 2)
        .attr('d', function (d) { return isVertical ? makeCoupleDiagV(d, layout.coords) : makeCoupleDiagH(d, layout.coords) })

    var ng = g.selectAll('.node-group').data(nodes, nodeKey)
        .join('g').attr('class', 'node-group')
        .attr('transform', function (d) {
            var p = getPoint(d, layout.coords)
            return 'translate(' + (isVertical ? p.x : p.y) + ',' + (isVertical ? p.y : p.x) + ')'
        })
        .style('cursor', 'pointer')

    var isSp = function (d) { return d.data._isSpouse === true }

    ng.selectAll('rect.node-rect').data(function (d) { return [d] }).join('rect').attr('class', 'node-rect')
        .attr('width', function (d) { return isSp(d) ? NW * 0.85 : NW })
        .attr('height', function (d) { return isSp(d) ? SNH : NH })
        .attr('x', function (d) { return isSp(d) ? -NW * 0.85 / 2 - 10 : -NW / 2 })
        .attr('y', function (d) { return isSp(d) ? -SNH / 2 : -NH / 2 })
        .attr('rx', 8).attr('ry', 8)
        .attr('fill', function (d) { if (isSp(d)) return '#1e293b'; var g = d.data.gender; if (g === 'male') return '#1e3a5f'; if (g === 'female') return '#4a1942'; return '#1e293b' })
        .attr('stroke', function (d) { if (isSp(d)) return '#64748b'; var g = d.data.gender; if (g === 'male') return '#3b82f6'; if (g === 'female') return '#a855f7'; return '#10b981' })
        .attr('stroke-width', 2)

    ng.selectAll('text.node-name').data(function (d) { return [d] }).join('text').attr('class', 'node-name')
        .attr('text-anchor', 'middle')
        .attr('dy', function (d) { return isSp(d) ? '-0.1em' : '-0.2em' })
        .attr('fill', '#e2e8f0').attr('font-size', function (d) { return isSp(d) ? '11px' : '13px' }).attr('font-weight', '600')
        .text(function (d) { var n = d.data.name || 'Unknown'; var ml = isSp(d) ? 20 : 25; return n.length > ml ? n.slice(0, ml) + '\u2026' : n })

    ng.selectAll('text.node-dates').data(function (d) { return [d] }).join('text').attr('class', 'node-dates')
        .attr('text-anchor', 'middle')
        .attr('dy', function (d) { return isSp(d) ? '0.9em' : '0.7em' })
        .attr('fill', '#94a3b8').attr('font-size', '10px')
        .text(function (d) { var b = d.data.birthDate ? new Date(d.data.birthDate).getFullYear() : '?'; var dt = d.data.deathDate ? ' - ' + new Date(d.data.deathDate).getFullYear() : ''; return b + dt })

    ng.selectAll('circle.gender-icon').data(function (d) { return d.data.gender ? [d] : [] }).join('circle').attr('class', 'gender-icon')
        .attr('cx', -NW / 2 + 12).attr('cy', -NH / 2 + 12).attr('r', 5)
        .attr('fill', function (d) { return d.data.gender === 'male' ? '#3b82f6' : '#a855f7' }).attr('opacity', 0.7)

    ng.on('click', function (event, d) {
        event.stopPropagation()
        event.stopImmediatePropagation()
        if (onNodeClick && !d.data._isVirtual) onNodeClick(d.data)
    })

    ng.on('mouseenter', function () { d3.select(this).select('rect.node-rect').transition().duration(150).attr('stroke-width', 3) })
        .on('mouseleave', function () { d3.select(this).select('rect.node-rect').transition().duration(150).attr('stroke-width', 2) })

    g.selectAll('.spouse-link-group').data([null]).join('g').attr('class', 'spouse-link-group')
        .selectAll('line.spouse-link').data(layout.spouseLinks).join('line').attr('class', 'spouse-link')
        .attr('x1', function (d) { var p = getPoint(d.s, layout.coords); return isVertical ? p.x : p.y })
        .attr('y1', function (d) { var p = getPoint(d.s, layout.coords); return isVertical ? p.y : p.x })
        .attr('x2', function (d) { var p = getPoint(d.t, layout.coords); return isVertical ? p.x : p.y })
        .attr('y2', function (d) { var p = getPoint(d.t, layout.coords); return isVertical ? p.y : p.x })
        .attr('stroke', '#f59e0b').attr('stroke-width', 2).attr('stroke-dasharray', '6,3').attr('opacity', 0.7)

    centerTree()
}

function makeSpouseAwareLayout(root, generationGap) {
    var coords = new Map()
    var spouseLinks = []

    root.descendants().forEach(function (node) {
        coords.set(node, { x: node.x, y: node.y })
    })

    root.descendants().forEach(function (node) {
        var spouses = (node.children || []).filter(function (child) { return child.data._isSpouse })
        spouses.forEach(function (spouse, i) {
            var parentPoint = getPoint(node, coords)
            var direction = i % 2 === 0 ? 1 : -1
            var distance = (NH + 28) * (Math.floor(i / 2) + 1)
            var originalSpousePoint = getPoint(spouse, coords)
            var depthShift = originalSpousePoint.y - parentPoint.y

            coords.set(spouse, {
                x: parentPoint.x + direction * distance,
                y: parentPoint.y
            })

            shiftDescendants(spouse, depthShift || generationGap, coords)
            spouseLinks.push({ s: node, t: spouse })
        })
    })

    return { coords: coords, spouseLinks: spouseLinks }
}

function shiftDescendants(node, amount, coords) {
    if (!node.children || amount === 0) return
    node.children.forEach(function (child) {
        var point = getPoint(child, coords)
        coords.set(child, { x: point.x, y: point.y - amount })
        shiftDescendants(child, amount, coords)
    })
}

function getPoint(node, coords) {
    return coords.get(node) || { x: node.x, y: node.y }
}

function nodeKey(d) {
    var parts = [d.data._isSpouse ? 'spouse' : 'person', d.data.id]
    if (d.parent) parts.push(d.parent.data.id)
    return parts.join(':')
}

function makeDiagH(d, coords) {
    var source = getPoint(d.source, coords)
    var target = getPoint(d.target, coords)
    var sx = source.y, sy = source.x
    var tx = target.y, ty = target.x
    var mx = (sx + tx) / 2
    return ['M', sx, ' ', sy, ' C', mx, ' ', sy, ' ', mx, ' ', ty, ' ', tx, ' ', ty].join('')
}

function makeDiagV(d, coords) {
    var source = getPoint(d.source, coords)
    var target = getPoint(d.target, coords)
    var sx = source.x, sy = source.y
    var tx = target.x, ty = target.y
    var my = (sy + ty) / 2
    return ['M', sx, ' ', sy, ' C', sx, ' ', my, ' ', tx, ' ', my, ' ', tx, ' ', ty].join('')
}

function makeCoupleDiagH(d, coords) {
    var partner = getPoint(d.source.parent, coords)
    var spouse = getPoint(d.source, coords)
    var target = getPoint(d.target, coords)
    var sx = (partner.y + spouse.y) / 2
    var sy = (partner.x + spouse.x) / 2
    var tx = target.y, ty = target.x
    var mx = (sx + tx) / 2
    return ['M', sx, ' ', sy, ' C', mx, ' ', sy, ' ', mx, ' ', ty, ' ', tx, ' ', ty].join('')
}

function makeCoupleDiagV(d, coords) {
    var partner = getPoint(d.source.parent, coords)
    var spouse = getPoint(d.source, coords)
    var target = getPoint(d.target, coords)
    var sx = (partner.x + spouse.x) / 2
    var sy = (partner.y + spouse.y) / 2
    var tx = target.x, ty = target.y
    var my = (sy + ty) / 2
    return ['M', sx, ' ', sy, ' C', sx, ' ', my, ' ', tx, ' ', my, ' ', tx, ' ', ty].join('')
}

function countNodes(n) { var c = 1; if (n.children) n.children.forEach(function (ch) { c += countNodes(ch) }); return c }

function centerTree() {
    if (!svg || !g) return
    var b = g.node() ? g.node().getBBox() : null
    if (!b || b.width === 0) return
    var cw = getContainerWidth(), ch = getContainerHeight()
    var s = Math.min(0.9 / Math.max(b.width / cw, b.height / ch), 1.5)
    var tx = (cw - b.width * s) / 2 - b.x * s + 40
    var ty = (ch - b.height * s) / 2 - b.y * s + 40
    currentTransform = d3Zoom.zoomIdentity.translate(tx, ty).scale(s)
    svg.transition().duration(500).call(zoom.transform, currentTransform)
}

export function zoomIn() { if (svg && zoom) svg.transition().duration(300).call(zoom.scaleBy, 1.4) }
export function zoomOut() { if (svg && zoom) svg.transition().duration(300).call(zoom.scaleBy, 0.7) }
export function resetZoom() { if (svg && zoom) svg.transition().duration(500).call(zoom.transform, d3Zoom.zoomIdentity) }
export function toggleLayout() { isVertical = !isVertical; return isVertical }

function getContainerWidth() { var e = document.getElementById('tree-container'); return e ? e.clientWidth : 800 }
function getContainerHeight() { var e = document.getElementById('tree-container'); return e ? e.clientHeight : 600 }
export function clearTree() { if (g) g.selectAll('*').remove() }
