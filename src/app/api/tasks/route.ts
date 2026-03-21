import { NextRequest, NextResponse } from 'next/server'
import { insertTask, getTasks, completeTask } from '@/lib/db'

export async function GET(req: NextRequest) {
  try {
    const url = req.nextUrl
    const completed = url.searchParams.get('completed')
    const due_before = url.searchParams.get('due_before')
    const phone = url.searchParams.get('phone')

    const filters: { completed?: boolean; due_before?: string; phone?: string } = {}
    if (completed !== null) filters.completed = completed === 'true'
    if (due_before) filters.due_before = due_before
    if (phone) filters.phone = phone

    const tasks = await getTasks(filters)
    return NextResponse.json({ success: true, data: tasks })
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Failed to fetch tasks' },
      { status: 500 }
    )
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { phone, title, due_at, created_by } = body

    if (!title?.trim() || !due_at) {
      return NextResponse.json({ success: false, error: 'Title and due_at are required' }, { status: 400 })
    }

    const id = await insertTask({ phone: phone || undefined, title: title.trim(), due_at, created_by: created_by || '' })
    return NextResponse.json({ success: true, id })
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Failed to create task' },
      { status: 500 }
    )
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json()
    const { id } = body

    if (!id) {
      return NextResponse.json({ success: false, error: 'Task id is required' }, { status: 400 })
    }

    await completeTask(Number(id))
    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Failed to complete task' },
      { status: 500 }
    )
  }
}
