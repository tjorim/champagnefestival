#include <pebble.h>

int main(void) {
  Window *window = window_create();
  window_stack_push(window, true);

#ifdef PBL_DEBUG
  ModdableCreationRecord creation = {
    .recordSize = sizeof(creation),
    .flags = kModdableCreationFlagDebug
  };
  moddable_createMachine(&creation);
#else
  moddable_createMachine(NULL);
#endif

  window_destroy(window);
  return 0;
}
