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

    var nodes = root.descendants()
    var links = root.links()

    g.selectAll('.link-group').data([null]).join('g').attr('class', 'link-group')
        .selectAll('path.link').data(links).join('path').attr('class', 'link')
        .attr('fill', 'none').attr('stroke', '#475569').attr('stroke-width', 2)
        .attr('d', function (d) { return isVertical ? makeDiagV(d) : makeDiagH(d) })

    var ng = g.selectAll('.node-group').data(nodes, function (d) { return String(d.data.id) })
        .join('g').attr('class', 'node-group')
        .attr('transform', function (d) { return 'translate(' + (isVertical ? d.x : d.y) + ',' + (isVertical ? d.y : d.x) + ')' })
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

    var sl = []
    function fsp(node) {
        if (!node.data || node.data._isVirtual) { if (node.children) node.children.forEach(fsp); return }
        if (node.children) for (var i = 0; i < node.children.length; i++) { var c = node.children[i]; if (c.data._isSpouse) sl.push({ s: node, t: c }); else fsp(c) }
    }
    fsp(root)

    g.selectAll('.spouse-link-group').data([null]).join('g').attr('class', 'spouse-link-group')
        .selectAll('line.spouse-link').data(sl).join('line').attr('class', 'spouse-link')
        .attr('x1', function (d) { return isVertical ? d.s.x : d.s.y })
        .attr('y1', function (d) { return isVertical ? d.s.y : d.s.x })
        .attr('x2', function (d) { return isVertical ? d.t.x : d.t.y })
        .attr('y2', function (d) { return isVertical ? d.t.y : d.t.x })
        .attr('stroke', '#f59e0b').attr('stroke-width', 2).attr('stroke-dasharray', '6,3').attr('opacity', 0.7)

    centerTree()
}

function makeDiagH(d) {
    var sx = d.source.y, sy = d.source.x
    var tx = d.target.y, ty = d.target.x
    var mx = (sx + tx) / 2
    return ['M', sx, ' ', sy, ' C', mx, ' ', sy, ' ', mx, ' ', ty, ' ', tx, ' ', ty].join('')
}

function makeDiagV(d) {
    var sx = d.source.x, sy = d.source.y
    var tx = d.target.x, ty = d.target.y
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
