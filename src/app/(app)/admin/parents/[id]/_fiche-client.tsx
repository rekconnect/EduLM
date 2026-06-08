// Moved to a shared, non-dynamic-route location so other routes (e.g. the
// student detail page) can import it without referencing a `[id]` folder
// path (which turbopack can fail to resolve). Re-exported here for the
// existing parent-fiche imports.
export { EditableGroup } from "@/components/fiche/editable-group";
