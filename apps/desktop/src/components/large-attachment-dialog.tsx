import type { ReactElement } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from '@/components/ui/dialog'
import { formatBytes } from '@/lib/format-bytes'
import { useLargeFileConfirm } from '@/lib/large-file-confirm'

/**
 * Confirm before a large file joins the graph. The size itself is fine —
 * it's the user's disk — but git keeps every version of a binary forever and
 * GitHub rejects files over 100 MB, so the go-ahead is explicit. Dismissing
 * the dialog declines the save. Mounted once at the app root, mirroring the
 * `large-file-confirm` store.
 */
export function LargeAttachmentDialog(): ReactElement {
  const pending = useLargeFileConfirm()
  return (
    <Dialog
      open={pending !== null}
      onOpenChange={(open) => {
        if (!open) {
          pending?.respond(false)
        }
      }}
    >
      <DialogContent>
        <DialogTitle>Add large file?</DialogTitle>
        <DialogDescription>
          {pending !== null
            ? `“${pending.file.name}” is ${formatBytes(pending.file.size)}. Large files stay in the graph's git history forever, and GitHub rejects files over 100 MB.`
            : ''}
        </DialogDescription>
        <DialogFooter>
          <Button variant="outline" onClick={() => pending?.respond(false)}>
            Cancel
          </Button>
          <Button onClick={() => pending?.respond(true)}>Add file</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
