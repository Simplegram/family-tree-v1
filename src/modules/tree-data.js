/**
 * Tree Data Transformation Module
 * Converts flat Dexie "persons" + "relationships" into hierarchical JSON for D3.
 */

/**
 * Build a hierarchical tree structure from flat persons and relationships.
 * Finds root nodes (people with no parents in the dataset) and builds downward.
 * Handles spouse linking by attaching spouses as special sibling-like nodes.
 *
 * @param {Array} persons - Array of person objects from Dexie
 * @param {Array} relationships - Array of relationship objects from Dexie
 * @returns {Array} Root nodes for D3 hierarchy
 */
export function buildTreeData(persons, relationships) {
    if (persons.length === 0) return []

    // Build lookup maps
    const personMap = new Map()
    for (const p of persons) {
        personMap.set(p.id, { ...p, _children: [], _spouses: [] })
    }

    // Index relationships by type for fast lookup
    const parentOf = new Map()   // parentId -> [childId, ...]
    const spouseOf = new Map()   // personId -> [spouseId, ...]

    for (const rel of relationships) {
        if (rel.type === 'parent') {
            if (!parentOf.has(rel.personId)) parentOf.set(rel.personId, [])
            parentOf.get(rel.personId).push(rel.relatedId)
        } else if (rel.type === 'spouse') {
            if (!spouseOf.has(rel.personId)) spouseOf.set(rel.personId, [])
            spouseOf.get(rel.personId).push(rel.relatedId)
            if (!spouseOf.has(rel.relatedId)) spouseOf.set(rel.relatedId, [])
            spouseOf.get(rel.relatedId).push(rel.personId)
        }
    }

    for (const [parentId, childIds] of [...parentOf.entries()]) {
        const spouseIds = spouseOf.get(parentId) || []
        for (const spouseId of spouseIds) {
            if (!parentOf.has(spouseId)) parentOf.set(spouseId, [])
            const spouseChildren = parentOf.get(spouseId)
            for (const childId of childIds) {
                if (childId !== spouseId && !spouseChildren.includes(childId)) {
                    spouseChildren.push(childId)
                }
            }
        }
    }

    // Link children and spouses into personMap nodes
    for (const [parentId, childIds] of parentOf) {
        const parent = personMap.get(parentId)
        if (!parent) continue
        for (const childId of childIds) {
            const child = personMap.get(childId)
            if (child && !parent._children.includes(childId)) {
                parent._children.push(childId)
            }
        }
    }

    for (const [personId, spouseIds] of spouseOf) {
        const person = personMap.get(personId)
        if (!person) continue
        // Deduplicate (spouse relationships are bidirectional in our DB)
        const uniqueSpouses = [...new Set(spouseIds)]
        for (const spouseId of uniqueSpouses) {
            if (spouseId !== personId && !person._spouses.includes(spouseId)) {
                person._spouses.push(spouseId)
            }
        }
    }

    // Find root nodes: people who have no parents in the dataset
    const hasParent = new Set()
    for (const rel of relationships) {
        if (rel.type === 'parent') {
            hasParent.add(rel.relatedId)
        } else if (rel.type === 'child') {
            hasParent.add(rel.personId) // this person has a parent (rel.relatedId)
        }
    }

    // Also exclude spouses from being roots if their spouse is already a root or child
    const roots = []
    const processed = new Set()

    for (const person of persons) {
        if (hasParent.has(person.id)) continue
        if (processed.has(person.id)) continue

        // If this person has a spouse that is also root-level, 
        // group them together to avoid duplicate trees
        const spouseIds = spouseOf.get(person.id) || []
        const primarySpouse = spouseIds.find((sid) => !hasParent.has(sid))

        if (primarySpouse && processed.has(primarySpouse)) continue

        roots.push(person.id)
        processed.add(person.id)
        if (primarySpouse) processed.add(primarySpouse)
    }

    // If no roots found (all people have parents), use the first person as root
    if (roots.length === 0 && persons.length > 0) {
        roots.push(persons[0].id)
    }

    // Recursively build tree nodes
    const result = []
    for (const rootId of roots) {
        const node = buildNode(rootId, personMap, new Set())
        if (node) result.push(node)
    }

    return result
}

/**
 * Recursively build a single tree node with spouse handling.
 * @param {number|string} personId 
 * @param {Map} personMap 
 * @param {Set} visited - Prevent infinite loops from circular references
 * @returns {Object|null} D3-compatible tree node
 */
function buildNode(personId, personMap, visited) {
    if (visited.has(personId)) return null
    visited.add(personId)

    const person = personMap.get(personId)
    if (!person) return null

    const node = {
        id: person.id,
        name: `${person.firstName} ${person.lastName}`.trim() || 'Unknown',
        firstName: person.firstName,
        lastName: person.lastName,
        birthDate: person.birthDate,
        deathDate: person.deathDate,
        gender: person.gender,
        bio: person.bio,
        photoUrl: person.photoUrl,
        _isSpouse: false,
        children: []
    }

    // Add spouses as special nodes (not in the main hierarchy line)
    for (const spouseId of person._spouses) {
        const spouse = personMap.get(spouseId)
        if (!spouse || visited.has(spouseId)) continue

        const spouseNode = {
            id: spouse.id,
            name: `${spouse.firstName} ${spouse.lastName}`.trim() || 'Unknown',
            firstName: spouse.firstName,
            lastName: spouse.lastName,
            birthDate: spouse.birthDate,
            deathDate: spouse.deathDate,
            gender: spouse.gender,
            bio: spouse.bio,
            photoUrl: spouse.photoUrl,
            _isSpouse: true,
            children: []
        }

        // Merge children from the main person into the spouse node for display 
        // (in D3 we'll handle this specially)
        node.children.push(spouseNode)

        visited.add(spouseId)
    }

    // Add actual children (not spouses) 
    // Children of the person go under the main node, not spouse nodes
    const childIds = new Set(person._children || [])
    for (const spouseId of person._spouses) {
        const spouse = personMap.get(spouseId)
        if (!spouse) continue
        for (const childId of spouse._children || []) {
            if (childId !== personId) childIds.add(childId)
        }
    }

    // If there are spouses, attach children to the first spouse node for proper genealogy display
    if (node.children.length > 0 && childIds.size > 0) {
        // Attach children to the spouse node (first child in our tree is the spouse)
        const spouseNode = node.children[0]
        for (const childId of childIds) {
            if (!visited.has(childId)) {
                const childNode = buildNode(childId, personMap, visited)
                if (childNode) spouseNode.children.push(childNode)
            }
        }
    } else if (childIds.size > 0) {
        // No spouses, children go directly under this node
        for (const childId of childIds) {
            if (!visited.has(childId)) {
                const childNode = buildNode(childId, personMap, visited)
                if (childNode) node.children.push(childNode)
            }
        }
    }

    return node
}

/**
 * Flatten a hierarchical tree back into a list for sidebar display.
 * @param {Array} treeRoots 
 * @returns {Array} Flat array of person nodes with depth info
 */
export function flattenTree(treeRoots) {
    const flat = []

    function walk(nodes, depth) {
        for (const node of nodes) {
            flat.push({ ...node, depth })
            if (node.children && node.children.length > 0) {
                walk(node.children, depth + 1)
            }
        }
    }

    walk(treeRoots, 0)
    return flat
}
